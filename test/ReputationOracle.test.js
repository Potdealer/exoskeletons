import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ReputationOracle", function () {
  let oracle, core;
  let owner, alice, bob, source1, source2, source3, treasury;

  const SCORE_KEY = ethers.keccak256(ethers.toUtf8Bytes("composite-reputation"));
  const CONFIG = ethers.toUtf8Bytes("test-config");

  async function deployFixture() {
    [owner, alice, bob, source1, source2, source3, treasury] = await ethers.getSigners();

    // Deploy ExoskeletonCore
    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);

    // Deploy ReputationOracle
    oracle = await ethers.deployContract("ReputationOracle", [
      await core.getAddress(),
      SCORE_KEY,
    ]);

    // Open minting (disable whitelist-only)
    await core.setWhitelistOnly(false);

    return { oracle, core, owner, alice, bob, source1, source2, source3, treasury };
  }

  // Helper: mint an Exo and grant oracle as scorer
  async function mintAndGrant(signer) {
    const price = await core.getMintPrice();
    await core.connect(signer).mint(CONFIG, { value: price });
    const tokenId = (await core.nextTokenId()) - 1n;
    // Token owner grants oracle as scorer
    await core.connect(signer).grantScorer(tokenId, await oracle.getAddress());
    return tokenId;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should deploy with correct initial state", async function () {
      await deployFixture();
      expect(await oracle.core()).to.equal(await core.getAddress());
      expect(await oracle.scoreKey()).to.equal(SCORE_KEY);
      expect(await oracle.totalWeight()).to.equal(0n);
      expect(await oracle.getSourceCount()).to.equal(0n);
    });

    it("Should revert if core address is zero", async function () {
      await deployFixture();
      await expect(
        ethers.deployContract("ReputationOracle", [ethers.ZeroAddress, SCORE_KEY])
      ).to.be.revertedWithCustomError(oracle, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SOURCE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Source Management", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    describe("addSource", function () {
      it("Should add a source with correct name and weight", async function () {
        await oracle.addSource(source1.address, "AgentOutlier", 4000);
        const info = await oracle.getSourceInfo(source1.address);
        expect(info.name).to.equal("AgentOutlier");
        expect(info.weight).to.equal(4000n);
        expect(info.registered).to.equal(true);
      });

      it("Should update totalWeight when adding sources", async function () {
        await oracle.addSource(source1.address, "Source1", 4000);
        expect(await oracle.totalWeight()).to.equal(4000n);

        await oracle.addSource(source2.address, "Source2", 3000);
        expect(await oracle.totalWeight()).to.equal(7000n);
      });

      it("Should track sources in sourceList", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await oracle.addSource(source2.address, "S2", 3000);

        const sources = await oracle.getSources();
        expect(sources.length).to.equal(2);
        expect(sources[0]).to.equal(source1.address);
        expect(sources[1]).to.equal(source2.address);
      });

      it("Should emit SourceAdded event", async function () {
        await expect(oracle.addSource(source1.address, "Outlier", 4000))
          .to.emit(oracle, "SourceAdded")
          .withArgs(source1.address, "Outlier", 4000);
      });

      it("Should revert if source already registered", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await expect(
          oracle.addSource(source1.address, "S1Again", 3000)
        ).to.be.revertedWithCustomError(oracle, "SourceAlreadyRegistered");
      });

      it("Should revert if source address is zero", async function () {
        await expect(
          oracle.addSource(ethers.ZeroAddress, "Zero", 4000)
        ).to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("Should revert if weight is zero", async function () {
        await expect(
          oracle.addSource(source1.address, "S1", 0)
        ).to.be.revertedWithCustomError(oracle, "ZeroWeight");
      });

      it("Should revert if called by non-owner", async function () {
        await expect(
          oracle.connect(alice).addSource(source1.address, "S1", 4000)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });

    describe("removeSource", function () {
      it("Should remove a source and update totalWeight", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await oracle.addSource(source2.address, "S2", 3000);

        await oracle.removeSource(source1.address);

        expect(await oracle.totalWeight()).to.equal(3000n);
        expect(await oracle.getSourceCount()).to.equal(1n);

        const info = await oracle.getSourceInfo(source1.address);
        expect(info.registered).to.equal(false);
      });

      it("Should emit SourceRemoved event", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await expect(oracle.removeSource(source1.address))
          .to.emit(oracle, "SourceRemoved")
          .withArgs(source1.address);
      });

      it("Should revert if source not registered", async function () {
        await expect(
          oracle.removeSource(source1.address)
        ).to.be.revertedWithCustomError(oracle, "SourceNotRegistered");
      });

      it("Should revert if called by non-owner", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await expect(
          oracle.connect(alice).removeSource(source1.address)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });

      it("Should handle removing the only source", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await oracle.removeSource(source1.address);

        expect(await oracle.getSourceCount()).to.equal(0n);
        expect(await oracle.totalWeight()).to.equal(0n);
      });

      it("Should handle removing middle source (swap-and-pop)", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await oracle.addSource(source2.address, "S2", 3000);
        await oracle.addSource(source3.address, "S3", 3000);

        // Remove middle one (source2) — source3 should swap in
        await oracle.removeSource(source2.address);

        const sources = await oracle.getSources();
        expect(sources.length).to.equal(2);
        expect(sources[0]).to.equal(source1.address);
        expect(sources[1]).to.equal(source3.address);
      });
    });

    describe("setWeight", function () {
      it("Should update weight and totalWeight", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await oracle.setWeight(source1.address, 6000);

        const info = await oracle.getSourceInfo(source1.address);
        expect(info.weight).to.equal(6000n);
        expect(await oracle.totalWeight()).to.equal(6000n);
      });

      it("Should emit WeightUpdated event", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await expect(oracle.setWeight(source1.address, 6000))
          .to.emit(oracle, "WeightUpdated")
          .withArgs(source1.address, 4000, 6000);
      });

      it("Should correctly adjust totalWeight with multiple sources", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await oracle.addSource(source2.address, "S2", 3000);
        // totalWeight = 7000

        await oracle.setWeight(source1.address, 5000);
        // totalWeight should be 7000 - 4000 + 5000 = 8000
        expect(await oracle.totalWeight()).to.equal(8000n);
      });

      it("Should revert if source not registered", async function () {
        await expect(
          oracle.setWeight(source1.address, 5000)
        ).to.be.revertedWithCustomError(oracle, "SourceNotRegistered");
      });

      it("Should revert if weight is zero", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await expect(
          oracle.setWeight(source1.address, 0)
        ).to.be.revertedWithCustomError(oracle, "ZeroWeight");
      });

      it("Should revert if called by non-owner", async function () {
        await oracle.addSource(source1.address, "S1", 4000);
        await expect(
          oracle.connect(alice).setWeight(source1.address, 6000)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SCORE REPORTING
  // ═══════════════════════════════════════════════════════════════

  describe("Score Reporting", function () {
    beforeEach(async function () {
      await deployFixture();
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.addSource(source2.address, "Board", 3000);
    });

    it("Should allow registered source to report a score", async function () {
      await oracle.connect(source1).reportScore(1, 1200);
      expect(await oracle.getSourceScore(source1.address, 1)).to.equal(1200n);
    });

    it("Should emit ScoreReported event", async function () {
      await expect(oracle.connect(source1).reportScore(1, 1200))
        .to.emit(oracle, "ScoreReported")
        .withArgs(source1.address, 1, 1200);
    });

    it("Should allow updating a previously reported score", async function () {
      await oracle.connect(source1).reportScore(1, 1200);
      await oracle.connect(source1).reportScore(1, 1500);
      expect(await oracle.getSourceScore(source1.address, 1)).to.equal(1500n);
    });

    it("Should track scores per source per token independently", async function () {
      await oracle.connect(source1).reportScore(1, 1200);
      await oracle.connect(source1).reportScore(2, 1000);
      await oracle.connect(source2).reportScore(1, 800);

      expect(await oracle.getSourceScore(source1.address, 1)).to.equal(1200n);
      expect(await oracle.getSourceScore(source1.address, 2)).to.equal(1000n);
      expect(await oracle.getSourceScore(source2.address, 1)).to.equal(800n);
      expect(await oracle.getSourceScore(source2.address, 2)).to.equal(0n);
    });

    it("Should revert if caller is not a registered source", async function () {
      await expect(
        oracle.connect(alice).reportScore(1, 1200)
      ).to.be.revertedWithCustomError(oracle, "SourceNotRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  RECALCULATION
  // ═══════════════════════════════════════════════════════════════

  describe("Recalculation", function () {
    let tokenId;

    beforeEach(async function () {
      await deployFixture();
      // Mint a token and grant oracle as scorer
      tokenId = await mintAndGrant(alice);
    });

    it("Should compute weighted average from single source", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.connect(source1).reportScore(tokenId, 1200);
      await oracle.recalculate(tokenId);

      // Single source: aggregate = 1200 (weight doesn't matter with one source)
      expect(await oracle.getReputation(tokenId)).to.equal(1200n);
    });

    it("Should compute weighted average from multiple sources", async function () {
      // Outlier: weight 4000, score 1200 => 1200 * 4000 = 4,800,000
      // Board:   weight 3000, score 800  => 800 * 3000  = 2,400,000
      // ACP:     weight 3000, score 500  => 500 * 3000  = 1,500,000
      // Total weighted = 8,700,000 / total active weight 10000 = 870
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.addSource(source2.address, "Board", 3000);
      await oracle.addSource(source3.address, "ACP", 3000);

      await oracle.connect(source1).reportScore(tokenId, 1200);
      await oracle.connect(source2).reportScore(tokenId, 800);
      await oracle.connect(source3).reportScore(tokenId, 500);

      await oracle.recalculate(tokenId);

      expect(await oracle.getReputation(tokenId)).to.equal(870n);
    });

    it("Should skip sources with zero score in calculation", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.addSource(source2.address, "Board", 3000);

      // Only source1 reports a score
      await oracle.connect(source1).reportScore(tokenId, 1200);
      // source2 has no report (score = 0), should be excluded

      await oracle.recalculate(tokenId);

      // Only Outlier counts: 1200 * 4000 / 4000 = 1200
      expect(await oracle.getReputation(tokenId)).to.equal(1200n);
    });

    it("Should write aggregate to ExoskeletonCore via setExternalScore", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.connect(source1).reportScore(tokenId, 1000);

      await expect(oracle.recalculate(tokenId))
        .to.emit(core, "ScoreUpdated")
        .withArgs(tokenId, SCORE_KEY, 1000);
    });

    it("Should emit ReputationRecalculated event", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.connect(source1).reportScore(tokenId, 1000);

      await expect(oracle.recalculate(tokenId))
        .to.emit(oracle, "ReputationRecalculated")
        .withArgs(tokenId, 1000);
    });

    it("Should return 0 if no sources have reported", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.recalculate(tokenId);

      expect(await oracle.getReputation(tokenId)).to.equal(0n);
    });

    it("Should revert if no sources are registered", async function () {
      await expect(
        oracle.recalculate(tokenId)
      ).to.be.revertedWithCustomError(oracle, "NoSources");
    });

    it("Should handle equal weights correctly", async function () {
      await oracle.addSource(source1.address, "S1", 5000);
      await oracle.addSource(source2.address, "S2", 5000);

      await oracle.connect(source1).reportScore(tokenId, 1000);
      await oracle.connect(source2).reportScore(tokenId, 2000);

      await oracle.recalculate(tokenId);

      // (1000*5000 + 2000*5000) / 10000 = 1500
      expect(await oracle.getReputation(tokenId)).to.equal(1500n);
    });

    it("Should handle unequal weights correctly (70/30 split)", async function () {
      await oracle.addSource(source1.address, "S1", 7000);
      await oracle.addSource(source2.address, "S2", 3000);

      await oracle.connect(source1).reportScore(tokenId, 1000);
      await oracle.connect(source2).reportScore(tokenId, 2000);

      await oracle.recalculate(tokenId);

      // (1000*7000 + 2000*3000) / 10000 = (7000000 + 6000000) / 10000 = 1300
      expect(await oracle.getReputation(tokenId)).to.equal(1300n);
    });

    it("Should allow anyone to trigger recalculation", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.connect(source1).reportScore(tokenId, 1000);

      // bob triggers recalculation (not owner, not source, not token owner)
      await oracle.connect(bob).recalculate(tokenId);
      expect(await oracle.getReputation(tokenId)).to.equal(1000n);
    });

    it("Should update cached score on re-recalculation", async function () {
      await oracle.addSource(source1.address, "Outlier", 4000);

      await oracle.connect(source1).reportScore(tokenId, 1000);
      await oracle.recalculate(tokenId);
      expect(await oracle.getReputation(tokenId)).to.equal(1000n);

      // Source updates score
      await oracle.connect(source1).reportScore(tokenId, 2000);
      await oracle.recalculate(tokenId);
      expect(await oracle.getReputation(tokenId)).to.equal(2000n);
    });

    it("Should handle weights that don't sum to 10000", async function () {
      // Weights sum to 6000, not 10000 — should still normalize correctly
      await oracle.addSource(source1.address, "S1", 2000);
      await oracle.addSource(source2.address, "S2", 4000);

      await oracle.connect(source1).reportScore(tokenId, 900);
      await oracle.connect(source2).reportScore(tokenId, 600);

      await oracle.recalculate(tokenId);

      // (900*2000 + 600*4000) / 6000 = (1800000 + 2400000) / 6000 = 700
      expect(await oracle.getReputation(tokenId)).to.equal(700n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BATCH RECALCULATION
  // ═══════════════════════════════════════════════════════════════

  describe("Batch Recalculation", function () {
    let tokenId1, tokenId2;

    beforeEach(async function () {
      await deployFixture();
      tokenId1 = await mintAndGrant(alice);
      tokenId2 = await mintAndGrant(bob);
      await oracle.addSource(source1.address, "Outlier", 5000);
      await oracle.addSource(source2.address, "Board", 5000);
    });

    it("Should recalculate multiple tokens in one call", async function () {
      await oracle.connect(source1).reportScore(tokenId1, 1000);
      await oracle.connect(source2).reportScore(tokenId1, 2000);
      await oracle.connect(source1).reportScore(tokenId2, 500);
      await oracle.connect(source2).reportScore(tokenId2, 1500);

      await oracle.recalculateBatch([tokenId1, tokenId2]);

      // Token1: (1000*5000 + 2000*5000) / 10000 = 1500
      expect(await oracle.getReputation(tokenId1)).to.equal(1500n);
      // Token2: (500*5000 + 1500*5000) / 10000 = 1000
      expect(await oracle.getReputation(tokenId2)).to.equal(1000n);
    });

    it("Should emit events for each token in batch", async function () {
      await oracle.connect(source1).reportScore(tokenId1, 1000);
      await oracle.connect(source1).reportScore(tokenId2, 500);

      const tx = oracle.recalculateBatch([tokenId1, tokenId2]);
      await expect(tx)
        .to.emit(oracle, "ReputationRecalculated")
        .withArgs(tokenId1, 1000);
      await expect(tx)
        .to.emit(oracle, "ReputationRecalculated")
        .withArgs(tokenId2, 500);
    });

    it("Should revert if no sources registered", async function () {
      // Deploy fresh oracle with no sources
      const freshOracle = await ethers.deployContract("ReputationOracle", [
        await core.getAddress(),
        SCORE_KEY,
      ]);
      await expect(
        freshOracle.recalculateBatch([tokenId1])
      ).to.be.revertedWithCustomError(freshOracle, "NoSources");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    it("getSourceCount should return correct count", async function () {
      expect(await oracle.getSourceCount()).to.equal(0n);
      await oracle.addSource(source1.address, "S1", 4000);
      expect(await oracle.getSourceCount()).to.equal(1n);
      await oracle.addSource(source2.address, "S2", 3000);
      expect(await oracle.getSourceCount()).to.equal(2n);
    });

    it("getSources should return all source addresses", async function () {
      await oracle.addSource(source1.address, "S1", 4000);
      await oracle.addSource(source2.address, "S2", 3000);

      const sources = await oracle.getSources();
      expect(sources).to.deep.equal([source1.address, source2.address]);
    });

    it("getSourceInfo should return correct data", async function () {
      await oracle.addSource(source1.address, "AgentOutlier", 4000);
      const info = await oracle.getSourceInfo(source1.address);
      expect(info.name).to.equal("AgentOutlier");
      expect(info.weight).to.equal(4000n);
      expect(info.registered).to.equal(true);
    });

    it("getSourceInfo for unregistered source returns defaults", async function () {
      const info = await oracle.getSourceInfo(source1.address);
      expect(info.name).to.equal("");
      expect(info.weight).to.equal(0n);
      expect(info.registered).to.equal(false);
    });

    it("getReputation returns 0 for tokens with no recalculation", async function () {
      expect(await oracle.getReputation(999)).to.equal(0n);
    });

    it("getSourceScore returns 0 for unreported scores", async function () {
      expect(await oracle.getSourceScore(source1.address, 1)).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN
  // ═══════════════════════════════════════════════════════════════

  describe("Admin", function () {
    beforeEach(async function () {
      await deployFixture();
    });

    describe("setCore", function () {
      it("Should update the core address", async function () {
        const newCore = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
        await oracle.setCore(await newCore.getAddress());
        expect(await oracle.core()).to.equal(await newCore.getAddress());
      });

      it("Should emit CoreUpdated event", async function () {
        const newCore = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
        await expect(oracle.setCore(await newCore.getAddress()))
          .to.emit(oracle, "CoreUpdated")
          .withArgs(await core.getAddress(), await newCore.getAddress());
      });

      it("Should revert with zero address", async function () {
        await expect(
          oracle.setCore(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("Should revert if called by non-owner", async function () {
        await expect(
          oracle.connect(alice).setCore(alice.address)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });

    describe("setScoreKey", function () {
      it("Should update the score key", async function () {
        const newKey = ethers.keccak256(ethers.toUtf8Bytes("new-key"));
        await oracle.setScoreKey(newKey);
        expect(await oracle.scoreKey()).to.equal(newKey);
      });

      it("Should emit ScoreKeyUpdated event", async function () {
        const newKey = ethers.keccak256(ethers.toUtf8Bytes("new-key"));
        await expect(oracle.setScoreKey(newKey))
          .to.emit(oracle, "ScoreKeyUpdated")
          .withArgs(SCORE_KEY, newKey);
      });

      it("Should revert if called by non-owner", async function () {
        const newKey = ethers.keccak256(ethers.toUtf8Bytes("new-key"));
        await expect(
          oracle.connect(alice).setScoreKey(newKey)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  INTEGRATION / EDGE CASES
  // ═══════════════════════════════════════════════════════════════

  describe("Integration & Edge Cases", function () {
    let tokenId;

    beforeEach(async function () {
      await deployFixture();
      tokenId = await mintAndGrant(alice);
    });

    it("Should handle source removal and re-addition gracefully", async function () {
      await oracle.addSource(source1.address, "S1", 4000);
      await oracle.connect(source1).reportScore(tokenId, 1000);

      await oracle.removeSource(source1.address);

      // Re-add with different weight
      await oracle.addSource(source1.address, "S1v2", 6000);
      // Old scores are still in the mapping
      expect(await oracle.getSourceScore(source1.address, tokenId)).to.equal(1000n);
    });

    it("Should handle very large scores without overflow", async function () {
      await oracle.addSource(source1.address, "S1", 5000);
      await oracle.addSource(source2.address, "S2", 5000);

      const largeScore = 10000n;
      await oracle.connect(source1).reportScore(tokenId, largeScore);
      await oracle.connect(source2).reportScore(tokenId, largeScore);

      await oracle.recalculate(tokenId);
      expect(await oracle.getReputation(tokenId)).to.equal(10000n);
    });

    it("Should handle score of 1 (minimum non-zero)", async function () {
      await oracle.addSource(source1.address, "S1", 10000);
      await oracle.connect(source1).reportScore(tokenId, 1);
      await oracle.recalculate(tokenId);
      expect(await oracle.getReputation(tokenId)).to.equal(1n);
    });

    it("Full lifecycle: add sources, report, recalculate, update, recalculate", async function () {
      // 1. Add sources
      await oracle.addSource(source1.address, "Outlier", 4000);
      await oracle.addSource(source2.address, "Board", 3000);
      await oracle.addSource(source3.address, "ACP", 3000);

      // 2. Report scores
      await oracle.connect(source1).reportScore(tokenId, 1200);
      await oracle.connect(source2).reportScore(tokenId, 800);
      await oracle.connect(source3).reportScore(tokenId, 500);

      // 3. Recalculate
      await oracle.recalculate(tokenId);
      // (1200*4000 + 800*3000 + 500*3000) / 10000 = (4800000+2400000+1500000)/10000 = 870
      expect(await oracle.getReputation(tokenId)).to.equal(870n);

      // 4. Update: Outlier ELO improves
      await oracle.connect(source1).reportScore(tokenId, 1500);
      await oracle.recalculate(tokenId);
      // (1500*4000 + 800*3000 + 500*3000) / 10000 = (6000000+2400000+1500000)/10000 = 990
      expect(await oracle.getReputation(tokenId)).to.equal(990n);

      // 5. Adjust weights: Board becomes more important
      await oracle.setWeight(source2.address, 4000);
      // totalWeight = 4000+4000+3000 = 11000
      await oracle.recalculate(tokenId);
      // (1500*4000 + 800*4000 + 500*3000) / 11000 = (6000000+3200000+1500000)/11000 = 972 (floor)
      expect(await oracle.getReputation(tokenId)).to.equal(972n);

      // 6. Remove ACP source
      await oracle.removeSource(source3.address);
      await oracle.recalculate(tokenId);
      // (1500*4000 + 800*4000) / 8000 = (6000000+3200000)/8000 = 1150
      expect(await oracle.getReputation(tokenId)).to.equal(1150n);
    });

    it("Should not revert on recalculate if oracle not granted scorer (core reverts)", async function () {
      // Mint but DON'T grant oracle as scorer
      const price = await core.getMintPrice();
      await core.connect(bob).mint(CONFIG, { value: price });
      const ungrantedTokenId = (await core.nextTokenId()) - 1n;

      await oracle.addSource(source1.address, "S1", 4000);
      await oracle.connect(source1).reportScore(ungrantedTokenId, 1000);

      // This should revert because oracle is not an allowed scorer on the token
      await expect(
        oracle.recalculate(ungrantedTokenId)
      ).to.be.revertedWithCustomError(core, "ExternalScorerNotAllowed");
    });
  });
});
