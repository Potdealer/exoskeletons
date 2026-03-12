import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("EncryptedMemoryModule", function () {
  let core, memory;
  let owner, alice, bob, writer1, treasury;

  const GENESIS_PRICE = ethers.parseEther("0.005");

  async function deployFixture() {
    [owner, alice, bob, writer1, treasury] = await ethers.getSigners();

    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
    await core.setWhitelist(alice.address, true);
    await core.setWhitelist(bob.address, true);

    memory = await ethers.deployContract("EncryptedMemoryModule", [await core.getAddress()]);

    return { core, memory, owner, alice, bob, writer1, treasury };
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
    await memory.connect(signer).onActivate(tokenId);
    return tokenId;
  }

  // Standard slot names
  const SLOT_IDENTITY = ethers.keccak256(ethers.toUtf8Bytes("identity"));
  const SLOT_MEMORY = ethers.keccak256(ethers.toUtf8Bytes("memory"));
  const SLOT_CONFIG = ethers.keccak256(ethers.toUtf8Bytes("config"));
  const SLOT_TRAINING = ethers.keccak256(ethers.toUtf8Bytes("training"));
  const SLOT_STRATEGY = ethers.keccak256(ethers.toUtf8Bytes("strategy"));
  const SLOT_BACKUP = ethers.keccak256(ethers.toUtf8Bytes("backup"));

  // Helper: fake encrypted data
  function fakeEncrypted(plaintext) {
    return ethers.toUtf8Bytes("ENC:" + plaintext);
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should deploy with correct metadata", async function () {
      await deployFixture();
      expect(await memory.moduleName()).to.equal("encrypted-memory");
      expect(await memory.moduleVersion()).to.equal("1.0.0");
      expect(await memory.isExoModule()).to.equal(true);
      expect(await memory.moduleDescription()).to.equal(
        "Token-bound encrypted agent memory, training, and backup storage"
      );
    });

    it("Should compute correct moduleKey", async function () {
      await deployFixture();
      const expectedKey = ethers.keccak256(ethers.toUtf8Bytes("encrypted-memory"));
      expect(await memory.moduleKey()).to.equal(expectedKey);
    });

    it("Should set builder to deployer", async function () {
      await deployFixture();
      expect(await memory.builder()).to.equal(owner.address);
    });

    it("Should store core address", async function () {
      await deployFixture();
      expect(await memory.exoskeletonCore()).to.equal(await core.getAddress());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ACTIVATION
  // ═══════════════════════════════════════════════════════════════

  describe("Activation", function () {
    it("Should allow token owner to activate", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      await memory.connect(alice).onActivate(tokenId);
      expect(await memory.isActiveFor(tokenId)).to.equal(true);
    });

    it("Should emit Activated event", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      await expect(memory.connect(alice).onActivate(tokenId))
        .to.emit(memory, "Activated");
    });

    it("Should revert if not token owner", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      await expect(memory.connect(bob).onActivate(tokenId))
        .to.be.revertedWithCustomError(memory, "NotTokenOwner");
    });

    it("Should revert if already active", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      await expect(memory.connect(alice).onActivate(tokenId))
        .to.be.revertedWithCustomError(memory, "AlreadyActive");
    });

    it("Should track total activations", async function () {
      await deployFixture();
      await mintAndActivate(alice);
      await mintAndActivate(bob);
      expect(await memory.totalActivations()).to.equal(2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  INLINE STORAGE
  // ═══════════════════════════════════════════════════════════════

  describe("Inline Storage", function () {
    it("Should store and read inline encrypted data", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = fakeEncrypted("my identity file");

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, data);

      const stored = await memory.readInline(tokenId, SLOT_IDENTITY);
      expect(ethers.toUtf8String(stored)).to.equal("ENC:my identity file");
    });

    it("Should emit MemoryStored on first write", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = fakeEncrypted("data");

      await expect(memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, data))
        .to.emit(memory, "MemoryStored")
        .withArgs(tokenId, SLOT_IDENTITY, 1, true, alice.address);
    });

    it("Should emit MemoryUpdated on overwrite", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v1"));
      await expect(memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v2")))
        .to.emit(memory, "MemoryUpdated")
        .withArgs(tokenId, SLOT_IDENTITY, 2, true, alice.address);
    });

    it("Should increment version on update", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v1"));
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v2"));
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v3"));

      const entry = await memory.getEntry(tokenId, SLOT_IDENTITY);
      expect(entry.version).to.equal(3);
    });

    it("Should store content hash correctly", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = fakeEncrypted("hash me");

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, data);

      const entry = await memory.getEntry(tokenId, SLOT_IDENTITY);
      expect(entry.contentHash).to.equal(ethers.keccak256(data));
    });

    it("Should revert on empty slot name", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(alice).storeInline(tokenId, ethers.ZeroHash, fakeEncrypted("data")))
        .to.be.revertedWithCustomError(memory, "SlotNameEmpty");
    });

    it("Should revert if data exceeds max inline size (4KB)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const bigData = new Uint8Array(4097);

      await expect(memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, bigData))
        .to.be.revertedWithCustomError(memory, "DataTooLarge");
    });

    it("Should allow max inline size (4096 bytes)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const maxData = new Uint8Array(4096);
      maxData.fill(0x42);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, maxData);

      const entry = await memory.getEntry(tokenId, SLOT_IDENTITY);
      expect(entry.size).to.equal(4096);
    });

    it("Should revert if module not active", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);

      await expect(memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data")))
        .to.be.revertedWithCustomError(memory, "NotActive");
    });

    it("Should revert if not writer", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(bob).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data")))
        .to.be.revertedWithCustomError(memory, "NotWriter");
    });

    it("Should track write count", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("a"));
      await memory.connect(alice).storeInline(tokenId, SLOT_MEMORY, fakeEncrypted("b"));
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("c")); // update

      expect(await memory.writeCount(tokenId)).to.equal(3n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  EXTERNAL STORAGE (off-chain references)
  // ═══════════════════════════════════════════════════════════════

  describe("External Storage", function () {
    const FAKE_HASH = ethers.keccak256(ethers.toUtf8Bytes("encrypted-blob"));
    const FAKE_URI = "net://8453/0x2460.../backup-2026-03-11";

    it("Should store external reference", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeExternal(
        tokenId, SLOT_BACKUP, FAKE_HASH, FAKE_URI, 50000n
      );

      const entry = await memory.getEntry(tokenId, SLOT_BACKUP);
      expect(entry.contentHash).to.equal(FAKE_HASH);
      expect(entry.storageURI).to.equal(FAKE_URI);
      expect(entry.size).to.equal(50000n);
      expect(entry.exists).to.equal(true);
      expect(entry.isInline).to.equal(false);
    });

    it("Should emit MemoryStored with isInline=false", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(alice).storeExternal(
        tokenId, SLOT_BACKUP, FAKE_HASH, FAKE_URI, 50000n
      ))
        .to.emit(memory, "MemoryStored")
        .withArgs(tokenId, SLOT_BACKUP, 1, false, alice.address);
    });

    it("Should revert if content hash is zero", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(alice).storeExternal(
        tokenId, SLOT_BACKUP, ethers.ZeroHash, FAKE_URI, 1000n
      ))
        .to.be.revertedWithCustomError(memory, "ContentHashRequired");
    });

    it("Should revert if URI too long", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const longURI = "x".repeat(257);

      await expect(memory.connect(alice).storeExternal(
        tokenId, SLOT_BACKUP, FAKE_HASH, longURI, 1000n
      ))
        .to.be.revertedWithCustomError(memory, "DataTooLarge");
    });

    it("Should clear inline data when storing external", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      // First store inline
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("inline data"));
      // Then overwrite with external
      await memory.connect(alice).storeExternal(
        tokenId, SLOT_IDENTITY, FAKE_HASH, FAKE_URI, 5000n
      );

      const inline = await memory.readInline(tokenId, SLOT_IDENTITY);
      expect(inline).to.equal("0x");

      const entry = await memory.getEntry(tokenId, SLOT_IDENTITY);
      expect(entry.isInline).to.equal(false);
      expect(entry.version).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SLOT ENUMERATION
  // ═══════════════════════════════════════════════════════════════

  describe("Slot Enumeration", function () {
    it("Should track slots", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("a"));
      await memory.connect(alice).storeInline(tokenId, SLOT_MEMORY, fakeEncrypted("b"));
      await memory.connect(alice).storeInline(tokenId, SLOT_CONFIG, fakeEncrypted("c"));

      const slots = await memory.getSlots(tokenId);
      expect(slots.length).to.equal(3);
      expect(slots).to.include(SLOT_IDENTITY);
      expect(slots).to.include(SLOT_MEMORY);
      expect(slots).to.include(SLOT_CONFIG);
    });

    it("Should not duplicate slots on update", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v1"));
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("v2"));

      expect(await memory.slotCount(tokenId)).to.equal(1n);
    });

    it("Should report hasSlot correctly", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      expect(await memory.hasSlot(tokenId, SLOT_IDENTITY)).to.equal(false);
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data"));
      expect(await memory.hasSlot(tokenId, SLOT_IDENTITY)).to.equal(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DELETE
  // ═══════════════════════════════════════════════════════════════

  describe("Delete", function () {
    it("Should allow token owner to delete a slot", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data"));
      await memory.connect(alice).deleteSlot(tokenId, SLOT_IDENTITY);

      const entry = await memory.getEntry(tokenId, SLOT_IDENTITY);
      expect(entry.exists).to.equal(false);
    });

    it("Should emit MemoryDeleted event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data"));
      await expect(memory.connect(alice).deleteSlot(tokenId, SLOT_IDENTITY))
        .to.emit(memory, "MemoryDeleted")
        .withArgs(tokenId, SLOT_IDENTITY);
    });

    it("Should revert if slot doesn't exist", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(alice).deleteSlot(tokenId, SLOT_IDENTITY))
        .to.be.revertedWithCustomError(memory, "SlotNotFound");
    });

    it("Should revert if not token owner (even if writer)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).grantWriter(tokenId, writer1.address);
      await memory.connect(writer1).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data"));

      await expect(memory.connect(writer1).deleteSlot(tokenId, SLOT_IDENTITY))
        .to.be.revertedWithCustomError(memory, "NotTokenOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  CONTENT VERIFICATION
  // ═══════════════════════════════════════════════════════════════

  describe("Content Verification", function () {
    it("Should verify matching content", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = fakeEncrypted("verify me");

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, data);

      expect(await memory.verifyContent(tokenId, SLOT_IDENTITY, data)).to.equal(true);
    });

    it("Should reject non-matching content", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("original"));

      expect(await memory.verifyContent(tokenId, SLOT_IDENTITY, fakeEncrypted("tampered")))
        .to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  WRITER PERMISSIONS
  // ═══════════════════════════════════════════════════════════════

  describe("Writer Permissions", function () {
    it("Should grant write access", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).grantWriter(tokenId, writer1.address);
      expect(await memory.canWrite(tokenId, writer1.address)).to.equal(true);
    });

    it("Should allow granted writer to store inline", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).grantWriter(tokenId, writer1.address);
      await memory.connect(writer1).storeInline(tokenId, SLOT_MEMORY, fakeEncrypted("agent wrote this"));

      const stored = await memory.readInline(tokenId, SLOT_MEMORY);
      expect(ethers.toUtf8String(stored)).to.equal("ENC:agent wrote this");
    });

    it("Should allow granted writer to store external", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("blob"));

      await memory.connect(alice).grantWriter(tokenId, writer1.address);
      await memory.connect(writer1).storeExternal(
        tokenId, SLOT_BACKUP, hash, "ipfs://Qm...", 10000n
      );

      const entry = await memory.getEntry(tokenId, SLOT_BACKUP);
      expect(entry.exists).to.equal(true);
    });

    it("Should revoke write access", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).grantWriter(tokenId, writer1.address);
      await memory.connect(alice).revokeWriter(tokenId, writer1.address);
      expect(await memory.canWrite(tokenId, writer1.address)).to.equal(false);
    });

    it("Should emit WriterGranted event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(alice).grantWriter(tokenId, writer1.address))
        .to.emit(memory, "WriterGranted")
        .withArgs(tokenId, writer1.address);
    });

    it("Should emit WriterRevoked event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await memory.connect(alice).grantWriter(tokenId, writer1.address);
      await expect(memory.connect(alice).revokeWriter(tokenId, writer1.address))
        .to.emit(memory, "WriterRevoked")
        .withArgs(tokenId, writer1.address);
    });

    it("Token owner is always a writer", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      expect(await memory.canWrite(tokenId, alice.address)).to.equal(true);
    });

    it("Non-owner non-writer cannot write", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      expect(await memory.canWrite(tokenId, bob.address)).to.equal(false);
    });

    it("Only token owner can grant writers", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(memory.connect(bob).grantWriter(tokenId, writer1.address))
        .to.be.revertedWithCustomError(memory, "NotTokenOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  MULTI-SLOT / REAL-WORLD USAGE
  // ═══════════════════════════════════════════════════════════════

  describe("Multi-Slot Usage", function () {
    it("Should support all standard slot types", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      const slots = [SLOT_IDENTITY, SLOT_MEMORY, SLOT_CONFIG, SLOT_TRAINING, SLOT_STRATEGY, SLOT_BACKUP];
      for (let i = 0; i < slots.length; i++) {
        await memory.connect(alice).storeInline(tokenId, slots[i], fakeEncrypted(`slot-${i}`));
      }

      expect(await memory.slotCount(tokenId)).to.equal(6n);
      const allSlots = await memory.getSlots(tokenId);
      for (const s of slots) {
        expect(allSlots).to.include(s);
      }
    });

    it("Should isolate data between tokens", async function () {
      await deployFixture();
      const tokenA = await mintAndActivate(alice);
      const tokenB = await mintAndActivate(bob);

      await memory.connect(alice).storeInline(tokenA, SLOT_IDENTITY, fakeEncrypted("alice agent"));
      await memory.connect(bob).storeInline(tokenB, SLOT_IDENTITY, fakeEncrypted("bob agent"));

      const dataA = await memory.readInline(tokenA, SLOT_IDENTITY);
      const dataB = await memory.readInline(tokenB, SLOT_IDENTITY);
      expect(ethers.toUtf8String(dataA)).to.equal("ENC:alice agent");
      expect(ethers.toUtf8String(dataB)).to.equal("ENC:bob agent");
    });

    it("Anyone can read encrypted data (ciphertext is public)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      await memory.connect(alice).storeInline(tokenId, SLOT_CONFIG, fakeEncrypted("secret keys"));

      // bob reads alice's encrypted data — gets ciphertext, not plaintext
      const stored = await memory.connect(bob).readInline(tokenId, SLOT_CONFIG);
      expect(stored).to.not.equal("0x");
    });

    it("Should mix inline and external storage", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("big backup"));

      // Small data inline
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("small"));
      // Large data external
      await memory.connect(alice).storeExternal(
        tokenId, SLOT_BACKUP, hash, "net://8453/backup-key", 500000n
      );

      const identityEntry = await memory.getEntry(tokenId, SLOT_IDENTITY);
      const backupEntry = await memory.getEntry(tokenId, SLOT_BACKUP);

      expect(identityEntry.isInline).to.equal(true);
      expect(backupEntry.isInline).to.equal(false);
      expect(backupEntry.storageURI).to.equal("net://8453/backup-key");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DEACTIVATION
  // ═══════════════════════════════════════════════════════════════

  describe("Deactivation", function () {
    it("Should allow deactivation", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      await memory.connect(alice).onDeactivate(tokenId);
      expect(await memory.isActiveFor(tokenId)).to.equal(false);
    });

    it("Should block writes after deactivation", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      await memory.connect(alice).onDeactivate(tokenId);

      await expect(memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("data")))
        .to.be.revertedWithCustomError(memory, "NotActive");
    });

    it("Data should persist after deactivation (read-only)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      await memory.connect(alice).storeInline(tokenId, SLOT_IDENTITY, fakeEncrypted("persistent"));
      await memory.connect(alice).onDeactivate(tokenId);

      // Data still readable even when deactivated
      const stored = await memory.readInline(tokenId, SLOT_IDENTITY);
      expect(ethers.toUtf8String(stored)).to.equal("ENC:persistent");
    });
  });
});
