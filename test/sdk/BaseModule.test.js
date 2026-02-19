import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("BaseModule (via MockModule)", function () {
  let core, mock;
  let owner, alice, bob, treasury;

  const GENESIS_PRICE = ethers.parseEther("0.005");

  async function deployFixture() {
    [owner, alice, bob, treasury] = await ethers.getSigners();

    // Deploy ExoskeletonCore
    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);

    // Whitelist alice and bob
    await core.setWhitelist(alice.address, true);
    await core.setWhitelist(bob.address, true);

    // Deploy MockModule
    mock = await ethers.deployContract("MockModule", [
      "test-module",
      "1.0.0",
      await core.getAddress(),
    ]);

    return { core, mock, owner, alice, bob, treasury };
  }

  async function mintExo(signer) {
    const config = ethers.toUtf8Bytes("default-cfg");
    const isWL = await core.whitelist(signer.address);
    const usedFree = await core.usedFreeMint(signer.address);
    const value = (isWL && !usedFree) ? 0n : await core.getMintPrice();
    await core.connect(signer).mint(config, { value });
    return await core.nextTokenId() - 1n;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT & METADATA
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should deploy with correct metadata", async function () {
      await deployFixture();
      expect(await mock.moduleName()).to.equal("test-module");
      expect(await mock.moduleVersion()).to.equal("1.0.0");
      expect(await mock.moduleDescription()).to.equal("Mock module for testing");
      expect(await mock.builder()).to.equal(owner.address);
    });

    it("Should compute moduleKey as keccak256 of name", async function () {
      await deployFixture();
      const expectedKey = ethers.keccak256(ethers.toUtf8Bytes("test-module"));
      expect(await mock.moduleKey()).to.equal(expectedKey);
    });

    it("Should return true for isExoModule", async function () {
      await deployFixture();
      expect(await mock.isExoModule()).to.equal(true);
    });

    it("Should store core address", async function () {
      await deployFixture();
      expect(await mock.exoskeletonCore()).to.equal(await core.getAddress());
    });

    it("Should start with zero activations", async function () {
      await deployFixture();
      expect(await mock.totalActivations()).to.equal(0n);
    });

    it("Should revert if core address is zero", async function () {
      await deployFixture();
      await expect(
        ethers.deployContract("MockModule", ["bad-module", "1.0.0", ethers.ZeroAddress])
      ).to.be.revertedWith("BaseModule: zero core address");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ACTIVATION
  // ═══════════════════════════════════════════════════════════════

  describe("Activation", function () {
    it("Should allow token owner to activate", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      expect(await mock.isActiveFor(tokenId)).to.equal(true);
      expect(await mock.totalActivations()).to.equal(1n);
    });

    it("Should emit Activated event", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await expect(mock.connect(alice).onActivate(tokenId))
        .to.emit(mock, "Activated")
        .withArgs(tokenId, (ts) => ts > 0n);
    });

    it("Should call _onActivate hook", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      expect(await mock.activateCallCount()).to.equal(1n);
      expect(await mock.lastActivatedToken()).to.equal(tokenId);
    });

    it("Should record activatedAt timestamp", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      expect(await mock.activatedAt(tokenId)).to.be.greaterThan(0n);
    });

    it("Should revert if not token owner", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await expect(mock.connect(bob).onActivate(tokenId))
        .to.be.revertedWithCustomError(mock, "NotTokenOwner");
    });

    it("Should revert if already active", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      await expect(mock.connect(alice).onActivate(tokenId))
        .to.be.revertedWithCustomError(mock, "AlreadyActive");
    });

    it("Should track multiple token activations", async function () {
      await deployFixture();
      const token1 = await mintExo(alice);
      const token2 = await mintExo(bob);

      await mock.connect(alice).onActivate(token1);
      await mock.connect(bob).onActivate(token2);

      expect(await mock.isActiveFor(token1)).to.equal(true);
      expect(await mock.isActiveFor(token2)).to.equal(true);
      expect(await mock.totalActivations()).to.equal(2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DEACTIVATION
  // ═══════════════════════════════════════════════════════════════

  describe("Deactivation", function () {
    it("Should allow token owner to deactivate", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      await mock.connect(alice).onDeactivate(tokenId);

      expect(await mock.isActiveFor(tokenId)).to.equal(false);
    });

    it("Should emit Deactivated event", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      await expect(mock.connect(alice).onDeactivate(tokenId))
        .to.emit(mock, "Deactivated")
        .withArgs(tokenId, (ts) => ts > 0n);
    });

    it("Should call _onDeactivate hook", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      await mock.connect(alice).onDeactivate(tokenId);

      expect(await mock.deactivateCallCount()).to.equal(1n);
      expect(await mock.lastDeactivatedToken()).to.equal(tokenId);
    });

    it("Should revert if not token owner", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      await expect(mock.connect(bob).onDeactivate(tokenId))
        .to.be.revertedWithCustomError(mock, "NotTokenOwner");
    });

    it("Should revert if not active", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await expect(mock.connect(alice).onDeactivate(tokenId))
        .to.be.revertedWithCustomError(mock, "NotActive");
    });

    it("Should allow reactivation after deactivation", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await mock.connect(alice).onActivate(tokenId);
      await mock.connect(alice).onDeactivate(tokenId);
      await mock.connect(alice).onActivate(tokenId);

      expect(await mock.isActiveFor(tokenId)).to.equal(true);
      expect(await mock.totalActivations()).to.equal(2n);
    });
  });
});
