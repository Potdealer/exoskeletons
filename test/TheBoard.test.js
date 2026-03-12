import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("TheBoard", function () {
  let board, mockExo, mockToken;
  let owner, alice, bob, house;

  async function deployFixture() {
    [owner, alice, bob, house] = await ethers.getSigners();

    // Deploy mock ERC721 (for Exo balance checks)
    mockExo = await ethers.deployContract("MockExoCore");

    // Deploy mock ERC20 (for $EXO feature payments)
    mockToken = await ethers.deployContract("MockERC20", ["EXO", "EXO", 18]);

    board = await ethers.deployContract("TheBoard", [
      await mockExo.getAddress(),
      await mockToken.getAddress(),
      house.address,
    ]);

    // Give alice some EXO tokens
    await mockToken.mint(alice.address, ethers.parseEther("10000"));
    await mockToken.connect(alice).approve(await board.getAddress(), ethers.parseEther("10000"));

    return { board, mockExo, mockToken, owner, alice, bob, house };
  }

  const SKILL_1 = ethers.keccak256(ethers.toUtf8Bytes("solidity"));
  const SKILL_2 = ethers.keccak256(ethers.toUtf8Bytes("security"));

  describe("Deployment", function () {
    it("Should deploy with correct state", async function () {
      await deployFixture();
      expect(await board.getListingCount()).to.equal(0);
      expect(await board.houseWallet()).to.equal(house.address);
    });

    it("Should revert on zero addresses", async function () {
      await deployFixture();
      await expect(
        ethers.deployContract("TheBoard", [ethers.ZeroAddress, await mockToken.getAddress(), house.address])
      ).to.be.revertedWithCustomError(board, "ZeroAddress");

      await expect(
        ethers.deployContract("TheBoard", [await mockExo.getAddress(), ethers.ZeroAddress, house.address])
      ).to.be.revertedWithCustomError(board, "ZeroAddress");

      await expect(
        ethers.deployContract("TheBoard", [await mockExo.getAddress(), await mockToken.getAddress(), ethers.ZeroAddress])
      ).to.be.revertedWithCustomError(board, "ZeroAddress");
    });
  });

  describe("Post Listing", function () {
    it("Should post a listing with all categories", async function () {
      await deployFixture();

      for (let cat = 0; cat < 5; cat++) {
        await expect(
          board.connect(alice).postListing(
            cat, [SKILL_1], ethers.parseEther("0.01"), 0,
            ethers.ZeroAddress, 0, "alice.xmtp", 0, "ipfs://test"
          )
        ).to.emit(board, "ListingPosted").withArgs(cat, alice.address, cat);
      }
      expect(await board.getListingCount()).to.equal(5);
    });

    it("Should post without Exo token ID", async function () {
      await deployFixture();
      await board.connect(alice).postListing(
        0, [SKILL_1, SKILL_2], ethers.parseEther("0.05"), 1,
        ethers.ZeroAddress, 0, "alice.fc", 0, ""
      );

      const listing = await board.getListing(0);
      expect(listing.poster).to.equal(alice.address);
      expect(listing.exoTokenId).to.equal(0);
      expect(listing.active).to.equal(true);
    });

    it("Should revert with too many skills", async function () {
      await deployFixture();
      const sixSkills = Array(6).fill(SKILL_1);
      await expect(
        board.connect(alice).postListing(0, sixSkills, 0, 3, ethers.ZeroAddress, 0, "", 0, "")
      ).to.be.revertedWithCustomError(board, "TooManySkills");
    });

    it("Should allow posting with 0 skills", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 3, ethers.ZeroAddress, 0, "", 0, "");
      expect(await board.getListingCount()).to.equal(1);
    });
  });

  describe("Update Listing", function () {
    it("Should update a listing by poster", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [SKILL_1], ethers.parseEther("0.01"), 0, ethers.ZeroAddress, 0, "old", 0, "");

      await expect(
        board.connect(alice).updateListing(0, [SKILL_2], ethers.parseEther("0.02"), 1, ethers.ZeroAddress, 0, "new", "meta")
      ).to.emit(board, "ListingUpdated").withArgs(0);

      const listing = await board.getListing(0);
      expect(listing.contact).to.equal("new");
      expect(listing.price).to.equal(ethers.parseEther("0.02"));
    });

    it("Should revert if not poster", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");

      await expect(
        board.connect(bob).updateListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", "")
      ).to.be.revertedWithCustomError(board, "NotPoster");
    });

    it("Should revert if listing removed", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");
      await board.connect(alice).removeListing(0);

      await expect(
        board.connect(alice).updateListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", "")
      ).to.be.revertedWithCustomError(board, "ListingNotActive");
    });
  });

  describe("Remove Listing", function () {
    it("Should remove a listing", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");

      await expect(board.connect(alice).removeListing(0))
        .to.emit(board, "ListingRemoved").withArgs(0);

      expect(await board.isActive(0)).to.equal(false);
    });

    it("Should revert if not poster", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");

      await expect(
        board.connect(bob).removeListing(0)
      ).to.be.revertedWithCustomError(board, "NotPoster");
    });
  });

  describe("Verified Badge", function () {
    it("Should return true for Exo holder", async function () {
      await deployFixture();
      await mockExo.mint(alice.address);
      expect(await board.isVerified(alice.address)).to.equal(true);
    });

    it("Should return false for non-holder", async function () {
      await deployFixture();
      expect(await board.isVerified(bob.address)).to.equal(false);
    });
  });

  describe("Featured Listing", function () {
    it("Should feature a listing with EXO transfer to house", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");

      const amount = ethers.parseEther("100");
      const houseBefore = await mockToken.balanceOf(house.address);

      await expect(
        board.connect(alice).featureListing(0, amount)
      ).to.emit(board, "ListingFeatured");

      const houseAfter = await mockToken.balanceOf(house.address);
      expect(houseAfter - houseBefore).to.equal(amount);
      expect(await board.isFeatured(0)).to.equal(true);
    });

    it("Should revert with zero amount", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");

      await expect(
        board.connect(alice).featureListing(0, 0)
      ).to.be.revertedWithCustomError(board, "ZeroAmount");
    });

    it("Should revert for inactive listing", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");
      await board.connect(alice).removeListing(0);

      await expect(
        board.connect(alice).featureListing(0, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(board, "ListingNotActive");
    });

    it("Should revert without token approval", async function () {
      await deployFixture();
      await board.connect(alice).postListing(0, [], 0, 0, ethers.ZeroAddress, 0, "", 0, "");

      // bob has no tokens or approval
      await expect(
        board.connect(bob).featureListing(0, ethers.parseEther("100"))
      ).to.be.revert(ethers);
    });
  });

  describe("View Helpers", function () {
    it("getListing should revert for non-existent", async function () {
      await deployFixture();
      await expect(board.getListing(999)).to.be.revertedWithCustomError(board, "ListingNotFound");
    });

    it("isActive returns false for non-existent", async function () {
      await deployFixture();
      expect(await board.isActive(999)).to.equal(false);
    });

    it("isFeatured returns false for non-existent", async function () {
      await deployFixture();
      expect(await board.isFeatured(999)).to.equal(false);
    });
  });

  describe("Admin", function () {
    it("Should update house wallet", async function () {
      await deployFixture();
      await expect(board.setHouseWallet(bob.address))
        .to.emit(board, "HouseWalletUpdated").withArgs(house.address, bob.address);
      expect(await board.houseWallet()).to.equal(bob.address);
    });

    it("Should revert zero address house wallet", async function () {
      await deployFixture();
      await expect(board.setHouseWallet(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(board, "ZeroAddress");
    });

    it("Should revert non-owner house wallet update", async function () {
      await deployFixture();
      await expect(board.connect(alice).setHouseWallet(bob.address))
        .to.be.revert(ethers);
    });
  });
});
