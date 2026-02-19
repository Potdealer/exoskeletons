import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ScoreModule", function () {
  let core, score;
  let owner, alice, bob, gameContract, treasury;

  const GENESIS_PRICE = ethers.parseEther("0.005");

  // Score type keys
  const ELO = ethers.keccak256(ethers.toUtf8Bytes("elo"));
  const WINS = ethers.keccak256(ethers.toUtf8Bytes("wins"));
  const LOSSES = ethers.keccak256(ethers.toUtf8Bytes("losses"));

  async function deployFixture() {
    [owner, alice, bob, gameContract, treasury] = await ethers.getSigners();

    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
    await core.setWhitelist(alice.address, true);
    await core.setWhitelist(bob.address, true);

    score = await ethers.deployContract("ScoreModule", [await core.getAddress()]);

    return { core, score, owner, alice, bob, gameContract, treasury };
  }

  async function mintExo(signer) {
    const config = ethers.toUtf8Bytes("default-cfg");
    const isWL = await core.whitelist(signer.address);
    const usedFree = await core.usedFreeMint(signer.address);
    const value = (isWL && !usedFree) ? 0n : await core.getMintPrice();
    await core.connect(signer).mint(config, { value });
    return await core.nextTokenId() - 1n;
  }

  async function mintAndActivate(signer) {
    const tokenId = await mintExo(signer);
    await score.connect(signer).onActivate(tokenId);
    return tokenId;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should deploy with correct metadata", async function () {
      await deployFixture();
      expect(await score.moduleName()).to.equal("score-tracker");
      expect(await score.moduleVersion()).to.equal("1.0.0");
      expect(await score.isExoModule()).to.equal(true);
    });

    it("Should compute correct moduleKey", async function () {
      await deployFixture();
      const expectedKey = ethers.keccak256(ethers.toUtf8Bytes("score-tracker"));
      expect(await score.moduleKey()).to.equal(expectedKey);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SCORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  describe("Set Score", function () {
    it("Should allow token owner to set score", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      expect(await score.getScore(tokenId, ELO)).to.equal(1200n);
    });

    it("Should emit ScoreSet event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(score.connect(alice).setScore(tokenId, ELO, 1500n))
        .to.emit(score, "ScoreSet")
        .withArgs(tokenId, ELO, 1500n, alice.address);
    });

    it("Should allow granted scorer to set score", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      await score.connect(gameContract).setScore(tokenId, ELO, 1800n);

      expect(await score.getScore(tokenId, ELO)).to.equal(1800n);
    });

    it("Should revert if not scorer or owner", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(score.connect(bob).setScore(tokenId, ELO, 1000n))
        .to.be.revertedWithCustomError(score, "NotScorer");
    });

    it("Should revert if module not active", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await expect(score.connect(alice).setScore(tokenId, ELO, 1000n))
        .to.be.revertedWithCustomError(score, "NotActive");
    });

    it("Should overwrite existing score", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).setScore(tokenId, ELO, 1500n);

      expect(await score.getScore(tokenId, ELO)).to.equal(1500n);
    });

    it("Should support negative scores", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, -100n);
      expect(await score.getScore(tokenId, ELO)).to.equal(-100n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  INCREMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Increment Score", function () {
    it("Should increment from zero", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).incrementScore(tokenId, WINS, 1n);
      expect(await score.getScore(tokenId, WINS)).to.equal(1n);
    });

    it("Should increment existing score", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).incrementScore(tokenId, ELO, 25n);

      expect(await score.getScore(tokenId, ELO)).to.equal(1225n);
    });

    it("Should decrement with negative delta", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).incrementScore(tokenId, ELO, -30n);

      expect(await score.getScore(tokenId, ELO)).to.equal(1170n);
    });

    it("Should emit ScoreIncremented event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await expect(score.connect(alice).incrementScore(tokenId, ELO, 50n))
        .to.emit(score, "ScoreIncremented")
        .withArgs(tokenId, ELO, 50n, 1250n);
    });

    it("Should allow granted scorer to increment", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      await score.connect(gameContract).setScore(tokenId, ELO, 1000n);
      await score.connect(gameContract).incrementScore(tokenId, ELO, 100n);

      expect(await score.getScore(tokenId, ELO)).to.equal(1100n);
    });

    it("Should track update count", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).incrementScore(tokenId, ELO, 25n);
      await score.connect(alice).setScore(tokenId, WINS, 5n);

      expect(await score.updateCount(tokenId)).to.equal(3n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SCORE TYPE ENUMERATION
  // ═══════════════════════════════════════════════════════════════

  describe("Score Type Enumeration", function () {
    it("Should track score types", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).setScore(tokenId, WINS, 10n);
      await score.connect(alice).setScore(tokenId, LOSSES, 3n);

      const types = await score.getScoreTypes(tokenId);
      expect(types.length).to.equal(3);
      expect(types).to.include(ELO);
      expect(types).to.include(WINS);
      expect(types).to.include(LOSSES);
    });

    it("Should not duplicate types on update", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).setScore(tokenId, ELO, 1300n);
      await score.connect(alice).incrementScore(tokenId, ELO, 50n);

      const types = await score.getScoreTypes(tokenId);
      expect(types.length).to.equal(1);
    });

    it("Should return all scores via getAllScores", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).setScore(tokenId, ELO, 1200n);
      await score.connect(alice).setScore(tokenId, WINS, 10n);

      const [types, values] = await score.getAllScores(tokenId);
      expect(types.length).to.equal(2);
      expect(values.length).to.equal(2);

      // Find ELO index
      const eloIdx = types.indexOf(ELO);
      expect(values[eloIdx]).to.equal(1200n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SCORER PERMISSIONS
  // ═══════════════════════════════════════════════════════════════

  describe("Scorer Permissions", function () {
    it("Should grant scorer access", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      expect(await score.canScore(tokenId, gameContract.address)).to.equal(true);
    });

    it("Should revoke scorer access", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      await score.connect(alice).revokeScorer(tokenId, gameContract.address);
      expect(await score.canScore(tokenId, gameContract.address)).to.equal(false);
    });

    it("Should emit ScorerGranted event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(score.connect(alice).grantScorer(tokenId, gameContract.address))
        .to.emit(score, "ScorerGranted")
        .withArgs(tokenId, gameContract.address);
    });

    it("Should emit ScorerRevoked event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      await expect(score.connect(alice).revokeScorer(tokenId, gameContract.address))
        .to.emit(score, "ScorerRevoked")
        .withArgs(tokenId, gameContract.address);
    });

    it("Should revert when granting already-granted scorer", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      await expect(score.connect(alice).grantScorer(tokenId, gameContract.address))
        .to.be.revertedWithCustomError(score, "ScorerAlreadyGranted");
    });

    it("Should revert when revoking non-granted scorer", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(score.connect(alice).revokeScorer(tokenId, gameContract.address))
        .to.be.revertedWithCustomError(score, "ScorerNotGranted");
    });

    it("Token owner is always a scorer", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      expect(await score.canScore(tokenId, alice.address)).to.equal(true);
    });

    it("Only token owner can grant scorers", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(score.connect(bob).grantScorer(tokenId, gameContract.address))
        .to.be.revertedWithCustomError(score, "NotTokenOwner");
    });

    it("Revoked scorer cannot write scores", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await score.connect(alice).grantScorer(tokenId, gameContract.address);
      await score.connect(gameContract).setScore(tokenId, ELO, 1000n);

      await score.connect(alice).revokeScorer(tokenId, gameContract.address);
      await expect(score.connect(gameContract).setScore(tokenId, ELO, 9999n))
        .to.be.revertedWithCustomError(score, "NotScorer");

      // Original score still intact
      expect(await score.getScore(tokenId, ELO)).to.equal(1000n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  MULTI-TOKEN
  // ═══════════════════════════════════════════════════════════════

  describe("Multi-Token", function () {
    it("Should track scores independently per token", async function () {
      await deployFixture();
      const token1 = await mintAndActivate(alice);
      const token2 = await mintAndActivate(bob);

      await score.connect(alice).setScore(token1, ELO, 1200n);
      await score.connect(bob).setScore(token2, ELO, 1800n);

      expect(await score.getScore(token1, ELO)).to.equal(1200n);
      expect(await score.getScore(token2, ELO)).to.equal(1800n);
    });

    it("Should track scorers independently per token", async function () {
      await deployFixture();
      const token1 = await mintAndActivate(alice);
      const token2 = await mintAndActivate(bob);

      await score.connect(alice).grantScorer(token1, gameContract.address);
      // gameContract is NOT a scorer for token2
      expect(await score.canScore(token1, gameContract.address)).to.equal(true);
      expect(await score.canScore(token2, gameContract.address)).to.equal(false);
    });
  });
});
