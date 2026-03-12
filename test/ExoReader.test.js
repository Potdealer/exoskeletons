import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ExoReader", function () {
  let core, wallet, registry, marketplace, memoryModule, board, reader;
  let owner, alice, bob, treasury;

  const GENESIS_PRICE = ethers.parseEther("0.005");
  const LISTING_FEE = ethers.parseEther("0.001");

  // A minimal mock ERC20 for TheBoard constructor
  let mockToken;

  async function deployFixture() {
    [owner, alice, bob, treasury] = await ethers.getSigners();

    // Deploy ExoskeletonCore
    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
    const coreAddr = await core.getAddress();

    // Whitelist alice & bob
    await core.setWhitelist(alice.address, true);
    await core.setWhitelist(bob.address, true);

    // Deploy ExoskeletonWallet (fake TBA impl, chainId 31337 for hardhat)
    wallet = await ethers.deployContract("ExoskeletonWallet", [
      coreAddr,
      ethers.ZeroAddress, // no TBA implementation — we won't activate wallets in tests
      31337n,
    ]);

    // Deploy ExoskeletonRegistry
    registry = await ethers.deployContract("ExoskeletonRegistry", [coreAddr]);

    // Deploy ModuleMarketplace
    marketplace = await ethers.deployContract("ModuleMarketplace", [
      coreAddr,
      treasury.address,
    ]);

    // Deploy EncryptedMemoryModule
    memoryModule = await ethers.deployContract("EncryptedMemoryModule", [coreAddr]);

    // Deploy a minimal ERC20 for TheBoard
    mockToken = await ethers.deployContract("MockERC20", ["Mock EXO", "mEXO", 18]);
    const mockTokenAddr = await mockToken.getAddress();

    // Deploy TheBoard
    board = await ethers.deployContract("TheBoard", [
      coreAddr,
      mockTokenAddr,
      treasury.address,
    ]);

    // Deploy ExoReader
    reader = await ethers.deployContract("ExoReader", [
      coreAddr,
      await wallet.getAddress(),
      await registry.getAddress(),
      await marketplace.getAddress(),
      await memoryModule.getAddress(),
      await board.getAddress(),
    ]);

    return { core, wallet, registry, marketplace, memoryModule, board, reader, mockToken };
  }

  async function mintExo(signer) {
    const config = ethers.toUtf8Bytes("test-config");
    const isWL = await core.whitelist(signer.address);
    const usedFree = await core.usedFreeMint(signer.address);
    const value = isWL && !usedFree ? 0n : await core.getMintPrice();
    await core.connect(signer).mint(config, { value });
    return await core.nextTokenId() - 1n;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should store all contract references", async function () {
      await deployFixture();
      expect(await reader.core()).to.equal(await core.getAddress());
      expect(await reader.wallet()).to.equal(await wallet.getAddress());
      expect(await reader.registry()).to.equal(await registry.getAddress());
      expect(await reader.marketplace()).to.equal(await marketplace.getAddress());
      expect(await reader.memoryModule()).to.equal(await memoryModule.getAddress());
      expect(await reader.board()).to.equal(await board.getAddress());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  IDENTITY
  // ═══════════════════════════════════════════════════════════════

  describe("getIdentity", function () {
    it("Should return identity for a minted token", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      await core.connect(alice).setName(tokenId, "Ollie");
      await core.connect(alice).setBio(tokenId, "First Exo");

      const info = await reader.getIdentity(tokenId);
      expect(info.name).to.equal("Ollie");
      expect(info.bio).to.equal("First Exo");
      expect(info.genesis).to.equal(true);
      expect(info.mintedAt).to.be.greaterThan(0n);
    });

    it("Should return empty for non-existent token (no revert)", async function () {
      await deployFixture();
      const info = await reader.getIdentity(999);
      // Non-existent token — getIdentity on core reverts, try/catch returns defaults
      expect(info.name).to.equal("");
      expect(info.genesis).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  WALLET INFO
  // ═══════════════════════════════════════════════════════════════

  describe("getWalletInfo", function () {
    it("Should return wallet info for a token with no wallet activated", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      const info = await reader.getWalletInfo(tokenId);
      expect(info.walletActive).to.equal(false);
      expect(info.tba).to.equal(ethers.ZeroAddress);
      expect(info.tbaBalance).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  REPUTATION INFO
  // ═══════════════════════════════════════════════════════════════

  describe("getReputationInfo", function () {
    it("Should return reputation data after activity", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      // Send a message to build reputation
      await core.connect(alice).sendMessage(
        tokenId, 0, ethers.ZeroHash, 0, ethers.toUtf8Bytes("hello")
      );

      // Write some data
      const key = ethers.keccak256(ethers.toUtf8Bytes("testkey"));
      await core.connect(alice).setData(tokenId, key, ethers.toUtf8Bytes("value"));

      const info = await reader.getReputationInfo(tokenId);
      expect(info.messagesSent).to.equal(1n);
      expect(info.storageWrites).to.equal(1n);
      expect(info.reputationScore).to.be.greaterThan(0n);
      expect(info.age).to.be.greaterThanOrEqual(0n);
    });

    it("Should return zeroes for non-existent token activity (no revert)", async function () {
      await deployFixture();
      const info = await reader.getReputationInfo(999);
      // Activity metrics should be zero for unminted token
      expect(info.messagesSent).to.equal(0n);
      expect(info.storageWrites).to.equal(0n);
      expect(info.modulesActive).to.equal(0n);
      // Note: reputationScore may be nonzero for unminted tokens because
      // core.getReputation returns block.number as age when mintedAt is 0
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  MEMORY INFO
  // ═══════════════════════════════════════════════════════════════

  describe("getMemoryInfo", function () {
    it("Should return memory module status when not activated", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      const info = await reader.getMemoryInfo(tokenId);
      expect(info.moduleActive).to.equal(false);
      expect(info.slotCount).to.equal(0n);
      expect(info.writeCount).to.equal(0n);
      expect(info.slotNames.length).to.equal(0);
    });

    it("Should return memory data when module is active with slots", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      // Activate memory module
      await memoryModule.connect(alice).onActivate(tokenId);

      // Write some memory
      const SLOT_IDENTITY = ethers.keccak256(ethers.toUtf8Bytes("identity"));
      const SLOT_CONFIG = ethers.keccak256(ethers.toUtf8Bytes("config"));
      await memoryModule.connect(alice).storeInline(
        tokenId, SLOT_IDENTITY, ethers.toUtf8Bytes("ENC:identity-data")
      );
      await memoryModule.connect(alice).storeInline(
        tokenId, SLOT_CONFIG, ethers.toUtf8Bytes("ENC:config-data")
      );

      const info = await reader.getMemoryInfo(tokenId);
      expect(info.moduleActive).to.equal(true);
      expect(info.slotCount).to.equal(2n);
      expect(info.slotNames.length).to.equal(2);
      expect(info.slotNames).to.include(SLOT_IDENTITY);
      expect(info.slotNames).to.include(SLOT_CONFIG);
      expect(info.writeCount).to.equal(2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  MESSAGE INFO
  // ═══════════════════════════════════════════════════════════════

  describe("getMessageInfo", function () {
    it("Should return message counts", async function () {
      await deployFixture();
      const tokenA = await mintExo(alice);
      const tokenB = await mintExo(bob);

      // Send a direct message from A to B
      await core.connect(alice).sendMessage(
        tokenA, tokenB, ethers.ZeroHash, 0, ethers.toUtf8Bytes("gm")
      );

      const info = await reader.getMessageInfo(tokenB);
      expect(info.inboxCount).to.equal(1n);
      expect(info.totalNetworkMessages).to.equal(1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  RECENT MESSAGES
  // ═══════════════════════════════════════════════════════════════

  describe("getRecentMessages", function () {
    it("Should return empty array when no messages", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      const msgs = await reader.getRecentMessages(tokenId, 5);
      expect(msgs.length).to.equal(0);
    });

    it("Should return recent messages in reverse chronological order", async function () {
      await deployFixture();
      const tokenA = await mintExo(alice);
      const tokenB = await mintExo(bob);

      // Send 3 messages from A to B
      await core.connect(alice).sendMessage(
        tokenA, tokenB, ethers.ZeroHash, 0, ethers.toUtf8Bytes("msg1")
      );
      await core.connect(alice).sendMessage(
        tokenA, tokenB, ethers.ZeroHash, 0, ethers.toUtf8Bytes("msg2")
      );
      await core.connect(alice).sendMessage(
        tokenA, tokenB, ethers.ZeroHash, 0, ethers.toUtf8Bytes("msg3")
      );

      const msgs = await reader.getRecentMessages(tokenB, 2);
      expect(msgs.length).to.equal(2);
      // Most recent first
      expect(ethers.toUtf8String(msgs[0].payload)).to.equal("msg3");
      expect(ethers.toUtf8String(msgs[1].payload)).to.equal("msg2");
    });

    it("Should cap at available messages", async function () {
      await deployFixture();
      const tokenA = await mintExo(alice);
      const tokenB = await mintExo(bob);

      await core.connect(alice).sendMessage(
        tokenA, tokenB, ethers.ZeroHash, 0, ethers.toUtf8Bytes("only-one")
      );

      // Ask for 5 but only 1 exists
      const msgs = await reader.getRecentMessages(tokenB, 5);
      expect(msgs.length).to.equal(1);
      expect(ethers.toUtf8String(msgs[0].payload)).to.equal("only-one");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  MARKETPLACE MODULES
  // ═══════════════════════════════════════════════════════════════

  describe("getMarketplaceModuleInfo", function () {
    it("Should return empty active modules for new token", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      const info = await reader.getMarketplaceModuleInfo(tokenId);
      expect(info.activeModuleNames.length).to.equal(0);
    });

    it("Should return active marketplace modules", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      // Register builder and submit a free module
      const modName = ethers.keccak256(ethers.toUtf8Bytes("test-module"));
      await marketplace.connect(alice).registerBuilder("Alice", "Builder");
      await marketplace.connect(alice).submitModule(
        modName, "Test Module", "A test module", "1.0.0", 0,
        { value: LISTING_FEE }
      );
      await marketplace.connect(owner).approveModule(modName);

      // Activate on token
      await marketplace.connect(alice).activateModule(tokenId, modName);

      const info = await reader.getMarketplaceModuleInfo(tokenId);
      expect(info.activeModuleNames.length).to.equal(1);
      expect(info.activeModuleNames[0]).to.equal(modName);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BOARD INFO
  // ═══════════════════════════════════════════════════════════════

  describe("getBoardInfo", function () {
    it("Should return total board listing count", async function () {
      await deployFixture();
      const info = await reader.getBoardInfo();
      expect(info.totalListings).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  EXTERNAL SCORES
  // ═══════════════════════════════════════════════════════════════

  describe("getExternalScore", function () {
    it("Should return 0 for unset scores", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      const score = await reader.getExternalScore(tokenId, ethers.keccak256(ethers.toUtf8Bytes("elo")));
      expect(score).to.equal(0n);
    });

    it("Should return set external scores", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      const eloKey = ethers.keccak256(ethers.toUtf8Bytes("elo"));

      // Grant scorer and set score
      await core.connect(alice).grantScorer(tokenId, owner.address);
      await core.connect(owner).setExternalScore(tokenId, eloKey, 1500n);

      const score = await reader.getExternalScore(tokenId, eloKey);
      expect(score).to.equal(1500n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  FULL PROFILE
  // ═══════════════════════════════════════════════════════════════

  describe("getFullProfile", function () {
    it("Should return comprehensive profile for a token", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      await core.connect(alice).setName(tokenId, "TestExo");
      await core.connect(alice).setBio(tokenId, "Full profile test");

      // Activate memory and store data
      await memoryModule.connect(alice).onActivate(tokenId);
      const SLOT_IDENTITY = ethers.keccak256(ethers.toUtf8Bytes("identity"));
      await memoryModule.connect(alice).storeInline(
        tokenId, SLOT_IDENTITY, ethers.toUtf8Bytes("ENC:test")
      );

      // Send a broadcast message
      await core.connect(alice).sendMessage(
        tokenId, 0, ethers.ZeroHash, 0, ethers.toUtf8Bytes("broadcast")
      );

      const profile = await reader.getFullProfile(tokenId);

      // Check owner
      expect(profile.owner).to.equal(alice.address);
      expect(profile.tokenId).to.equal(tokenId);

      // Check identity
      expect(profile.identity.name).to.equal("TestExo");
      expect(profile.identity.bio).to.equal("Full profile test");
      expect(profile.identity.genesis).to.equal(true);

      // Check wallet (not activated)
      expect(profile.walletInfo.walletActive).to.equal(false);

      // Check reputation
      expect(profile.reputation.messagesSent).to.equal(1n);
      expect(profile.reputation.reputationScore).to.be.greaterThan(0n);

      // Check memory
      expect(profile.memory_.moduleActive).to.equal(true);
      expect(profile.memory_.slotCount).to.equal(1n);
      expect(profile.memory_.writeCount).to.equal(1n);

      // Check external scores (default 0)
      expect(profile.eloScore).to.equal(0n);
      expect(profile.boardScore).to.equal(0n);
    });

    it("Should not revert for non-existent token", async function () {
      await deployFixture();
      const profile = await reader.getFullProfile(999);
      expect(profile.owner).to.equal(ethers.ZeroAddress);
      expect(profile.identity.name).to.equal("");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BATCH
  // ═══════════════════════════════════════════════════════════════

  describe("getProfileBatch", function () {
    it("Should return profiles for multiple tokens", async function () {
      await deployFixture();
      const token1 = await mintExo(alice);
      const token2 = await mintExo(bob);

      await core.connect(alice).setName(token1, "Alice");
      await core.connect(bob).setName(token2, "Bob");

      const profiles = await reader.getProfileBatch([token1, token2]);
      expect(profiles.length).to.equal(2);
      expect(profiles[0].identity.name).to.equal("Alice");
      expect(profiles[0].owner).to.equal(alice.address);
      expect(profiles[1].identity.name).to.equal("Bob");
      expect(profiles[1].owner).to.equal(bob.address);
    });

    it("Should handle mix of valid and invalid tokens", async function () {
      await deployFixture();
      const token1 = await mintExo(alice);

      const profiles = await reader.getProfileBatch([token1, 999n]);
      expect(profiles.length).to.equal(2);
      expect(profiles[0].owner).to.equal(alice.address);
      expect(profiles[1].owner).to.equal(ethers.ZeroAddress);
    });
  });
});
