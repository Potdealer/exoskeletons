import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("BoardEscrow", function () {
  let board, escrow, mockExo, mockToken, mockUSDC;
  let owner, buyer, worker, house;

  const ESCROW_FEE_BPS = 200n;
  const CANCEL_FEE_BPS = 50n;
  const BPS = 10000n;
  const TIMEOUT = 48n * 3600n;

  async function deployFixture() {
    [owner, buyer, worker, house] = await ethers.getSigners();

    mockExo = await ethers.deployContract("MockExoCore");
    mockToken = await ethers.deployContract("MockERC20", ["EXO", "EXO", 18]);
    mockUSDC = await ethers.deployContract("MockERC20", ["USDC", "USDC", 6]);

    board = await ethers.deployContract("TheBoard", [
      await mockExo.getAddress(),
      await mockToken.getAddress(),
      house.address,
    ]);

    escrow = await ethers.deployContract("BoardEscrow", [
      await board.getAddress(),
      await mockExo.getAddress(),
      house.address,
    ]);

    // Post a test listing
    await board.connect(worker).postListing(
      0, [], ethers.parseEther("0.1"), 0,
      ethers.ZeroAddress, 0, "worker.xmtp", 0, ""
    );

    // Give buyer USDC for ERC20 tests
    await mockUSDC.mint(buyer.address, 1_000_000n * 10n ** 6n);
    await mockUSDC.connect(buyer).approve(await escrow.getAddress(), 1_000_000n * 10n ** 6n);

    return { board, escrow, mockExo, mockToken, mockUSDC, owner, buyer, worker, house };
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should deploy with correct state", async function () {
      await deployFixture();
      expect(await escrow.getEscrowCount()).to.equal(0);
      expect(await escrow.houseWallet()).to.equal(house.address);
    });

    it("Should revert on zero addresses", async function () {
      await deployFixture();
      const boardAddr = await board.getAddress();
      const exoAddr = await mockExo.getAddress();

      await expect(
        ethers.deployContract("BoardEscrow", [ethers.ZeroAddress, exoAddr, house.address])
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");

      await expect(
        ethers.deployContract("BoardEscrow", [boardAddr, ethers.ZeroAddress, house.address])
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");

      await expect(
        ethers.deployContract("BoardEscrow", [boardAddr, exoAddr, ethers.ZeroAddress])
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  FULL LIFECYCLE — ETH
  // ═══════════════════════════════════════════════════════════════

  describe("Full Lifecycle (ETH)", function () {
    it("create → accept → deliver → confirm", async function () {
      await deployFixture();
      const amount = ethers.parseEther("1");

      // Create
      await expect(
        escrow.connect(buyer).createEscrow(0, worker.address, { value: amount })
      ).to.emit(escrow, "EscrowCreated").withArgs(0, 0, buyer.address, worker.address, amount);

      // Accept
      await expect(escrow.connect(worker).acceptEscrow(0))
        .to.emit(escrow, "EscrowAccepted").withArgs(0);

      // Deliver
      const deliverable = ethers.toUtf8Bytes("ipfs://deliverable");
      await expect(escrow.connect(worker).submitDeliverable(0, deliverable))
        .to.emit(escrow, "DeliverableSubmitted");

      // Confirm
      const fee = (amount * ESCROW_FEE_BPS) / BPS;
      const payout = amount - fee;

      const houseBefore = await ethers.provider.getBalance(house.address);
      const workerBefore = await ethers.provider.getBalance(worker.address);

      const tx = await escrow.connect(buyer).confirmDelivery(0);
      await tx.wait();

      const houseAfter = await ethers.provider.getBalance(house.address);
      const workerAfter = await ethers.provider.getBalance(worker.address);

      expect(houseAfter - houseBefore).to.equal(fee);
      expect(workerAfter - workerBefore).to.equal(payout);

      // Stats
      expect(await escrow.jobsCompleted(worker.address)).to.equal(1);
      expect(await escrow.jobsHired(buyer.address)).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  FULL LIFECYCLE — ERC20
  // ═══════════════════════════════════════════════════════════════

  describe("Full Lifecycle (ERC20)", function () {
    it("create → accept → deliver → confirm with USDC", async function () {
      await deployFixture();
      const amount = 100n * 10n ** 6n; // 100 USDC
      const usdcAddr = await mockUSDC.getAddress();

      await escrow.connect(buyer).createEscrowERC20(0, worker.address, usdcAddr, amount);
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("done"));

      const fee = (amount * ESCROW_FEE_BPS) / BPS;
      const payout = amount - fee;

      await escrow.connect(buyer).confirmDelivery(0);

      expect(await mockUSDC.balanceOf(house.address)).to.equal(fee);
      expect(await mockUSDC.balanceOf(worker.address)).to.equal(payout);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  TIMEOUT
  // ═══════════════════════════════════════════════════════════════

  describe("Timeout", function () {
    it("Worker claims after 48h timeout", async function () {
      await deployFixture();
      const amount = ethers.parseEther("1");

      await escrow.connect(buyer).createEscrow(0, worker.address, { value: amount });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("delivered"));

      // Too early
      await expect(
        escrow.connect(worker).claimTimeout(0)
      ).to.be.revertedWithCustomError(escrow, "TimeoutNotReached");

      // Advance 48h + 1s
      await networkHelpers.time.increase(48 * 3600 + 1);

      const workerBefore = await ethers.provider.getBalance(worker.address);
      const tx = await escrow.connect(worker).claimTimeout(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const workerAfter = await ethers.provider.getBalance(worker.address);

      const fee = (amount * ESCROW_FEE_BPS) / BPS;
      const payout = amount - fee;
      expect(workerAfter - workerBefore + gasUsed).to.equal(payout);

      // Check status
      const e = await escrow.getEscrow(0);
      expect(e.status).to.equal(3); // CONFIRMED
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DISPUTE
  // ═══════════════════════════════════════════════════════════════

  describe("Dispute", function () {
    it("Buyer disputes, owner resolves to worker", async function () {
      await deployFixture();
      const amount = ethers.parseEther("1");

      await escrow.connect(buyer).createEscrow(0, worker.address, { value: amount });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("work"));

      await expect(escrow.connect(buyer).disputeDelivery(0))
        .to.emit(escrow, "DeliveryDisputed").withArgs(0);

      const workerBefore = await ethers.provider.getBalance(worker.address);
      await expect(escrow.resolveDispute(0, true))
        .to.emit(escrow, "DisputeResolved").withArgs(0, true);

      const workerAfter = await ethers.provider.getBalance(worker.address);
      const fee = (amount * ESCROW_FEE_BPS) / BPS;
      expect(workerAfter - workerBefore).to.equal(amount - fee);
    });

    it("Owner resolves to buyer", async function () {
      await deployFixture();
      const amount = ethers.parseEther("1");

      await escrow.connect(buyer).createEscrow(0, worker.address, { value: amount });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("bad work"));
      await escrow.connect(buyer).disputeDelivery(0);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.resolveDispute(0, false);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      // Full refund, no fee
      expect(buyerAfter - buyerBefore).to.equal(amount);
    });

    it("Only owner can resolve disputes", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("x"));
      await escrow.connect(buyer).disputeDelivery(0);

      await expect(
        escrow.connect(buyer).resolveDispute(0, true)
      ).to.be.revert(ethers);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  CANCEL
  // ═══════════════════════════════════════════════════════════════

  describe("Cancel", function () {
    it("Buyer cancels before acceptance with 0.5% fee", async function () {
      await deployFixture();
      const amount = ethers.parseEther("10");

      await escrow.connect(buyer).createEscrow(0, worker.address, { value: amount });

      const fee = (amount * CANCEL_FEE_BPS) / BPS;
      const refund = amount - fee;

      const houseBefore = await ethers.provider.getBalance(house.address);
      const buyerBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await escrow.connect(buyer).cancelEscrow(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;

      const houseAfter = await ethers.provider.getBalance(house.address);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      expect(houseAfter - houseBefore).to.equal(fee);
      expect(buyerAfter - buyerBefore + gasUsed).to.equal(refund);
    });

    it("Cannot cancel after acceptance", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);

      await expect(
        escrow.connect(buyer).cancelEscrow(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Only buyer can cancel", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });

      await expect(
        escrow.connect(worker).cancelEscrow(0)
      ).to.be.revertedWithCustomError(escrow, "NotBuyer");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  TIPS
  // ═══════════════════════════════════════════════════════════════

  describe("Tips", function () {
    it("Should send tip 100% to recipient", async function () {
      await deployFixture();
      const tipAmount = ethers.parseEther("0.5");

      const workerBefore = await ethers.provider.getBalance(worker.address);

      await expect(
        escrow.connect(buyer).tip(worker.address, { value: tipAmount })
      ).to.emit(escrow, "TipSent").withArgs(buyer.address, worker.address, tipAmount);

      const workerAfter = await ethers.provider.getBalance(worker.address);
      expect(workerAfter - workerBefore).to.equal(tipAmount);
    });

    it("Should revert tip to zero address", async function () {
      await deployFixture();
      await expect(
        escrow.connect(buyer).tip(ethers.ZeroAddress, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("Should revert tip with zero value", async function () {
      await deployFixture();
      await expect(
        escrow.connect(buyer).tip(worker.address, { value: 0 })
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  REPUTATION
  // ═══════════════════════════════════════════════════════════════

  describe("Reputation Writeback", function () {
    it("Should write reputation after confirmed delivery", async function () {
      await deployFixture();
      const amount = ethers.parseEther("1");

      // Mint Exos and grant scorer
      const exoAddr = await mockExo.getAddress();
      const escrowAddr = await escrow.getAddress();

      const workerExoId = await mockExo.mint.staticCall(worker.address);
      await mockExo.mint(worker.address);
      await mockExo.connect(worker).grantScorer(workerExoId, escrowAddr);

      const buyerExoId = await mockExo.mint.staticCall(buyer.address);
      await mockExo.mint(buyer.address);
      await mockExo.connect(buyer).grantScorer(buyerExoId, escrowAddr);

      // Full lifecycle
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: amount });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("done"));
      await escrow.connect(buyer).confirmDelivery(0);

      // Check scores
      const BOARD_SCORE_KEY = ethers.keccak256(ethers.toUtf8Bytes("board.reputation"));
      expect(await mockExo.externalScores(workerExoId, BOARD_SCORE_KEY)).to.equal(1);
      expect(await mockExo.externalScores(buyerExoId, BOARD_SCORE_KEY)).to.equal(1);
    });

    it("Should not revert if scorer not granted", async function () {
      await deployFixture();
      // No Exos minted, no scorers granted — should still complete
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("done"));

      // Should not revert
      await expect(escrow.connect(buyer).confirmDelivery(0)).to.not.be.revert(ethers);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  REVERT CASES
  // ═══════════════════════════════════════════════════════════════

  describe("Revert Cases", function () {
    it("Cannot create escrow with zero value", async function () {
      await deployFixture();
      await expect(
        escrow.connect(buyer).createEscrow(0, worker.address, { value: 0 })
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });

    it("Cannot create escrow with zero worker", async function () {
      await deployFixture();
      await expect(
        escrow.connect(buyer).createEscrow(0, ethers.ZeroAddress, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("Only worker can accept", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });

      await expect(
        escrow.connect(buyer).acceptEscrow(0)
      ).to.be.revertedWithCustomError(escrow, "NotWorker");
    });

    it("Only worker can submit deliverable", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);

      await expect(
        escrow.connect(buyer).submitDeliverable(0, ethers.toUtf8Bytes("x"))
      ).to.be.revertedWithCustomError(escrow, "NotWorker");
    });

    it("Cannot deliver before acceptance", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });

      await expect(
        escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("x"))
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Cannot confirm before delivery", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);

      await expect(
        escrow.connect(buyer).confirmDelivery(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Cannot double-confirm", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("done"));
      await escrow.connect(buyer).confirmDelivery(0);

      await expect(
        escrow.connect(buyer).confirmDelivery(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Cannot dispute after confirm", async function () {
      await deployFixture();
      await escrow.connect(buyer).createEscrow(0, worker.address, { value: ethers.parseEther("1") });
      await escrow.connect(worker).acceptEscrow(0);
      await escrow.connect(worker).submitDeliverable(0, ethers.toUtf8Bytes("done"));
      await escrow.connect(buyer).confirmDelivery(0);

      await expect(
        escrow.connect(buyer).disputeDelivery(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN
  // ═══════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("Should update house wallet", async function () {
      await deployFixture();
      await expect(escrow.setHouseWallet(buyer.address))
        .to.emit(escrow, "HouseWalletUpdated");
      expect(await escrow.houseWallet()).to.equal(buyer.address);
    });

    it("Should revert non-owner house wallet update", async function () {
      await deployFixture();
      await expect(
        escrow.connect(buyer).setHouseWallet(buyer.address)
      ).to.be.revert(ethers);
    });
  });
});
