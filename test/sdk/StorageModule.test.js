import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("StorageModule", function () {
  let core, storage;
  let owner, alice, bob, writer1, treasury;

  const GENESIS_PRICE = ethers.parseEther("0.005");

  async function deployFixture() {
    [owner, alice, bob, writer1, treasury] = await ethers.getSigners();

    core = await ethers.deployContract("ExoskeletonCore", [treasury.address]);
    await core.setWhitelist(alice.address, true);
    await core.setWhitelist(bob.address, true);

    storage = await ethers.deployContract("StorageModule", [await core.getAddress()]);

    return { core, storage, owner, alice, bob, writer1, treasury };
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
    await storage.connect(signer).onActivate(tokenId);
    return tokenId;
  }

  const KEY_A = ethers.keccak256(ethers.toUtf8Bytes("agent-memory"));
  const KEY_B = ethers.keccak256(ethers.toUtf8Bytes("config"));

  // ═══════════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should deploy with correct metadata", async function () {
      await deployFixture();
      expect(await storage.moduleName()).to.equal("storage-vault");
      expect(await storage.moduleVersion()).to.equal("1.0.0");
      expect(await storage.isExoModule()).to.equal(true);
    });

    it("Should compute correct moduleKey", async function () {
      await deployFixture();
      const expectedKey = ethers.keccak256(ethers.toUtf8Bytes("storage-vault"));
      expect(await storage.moduleKey()).to.equal(expectedKey);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  describe("Write", function () {
    it("Should allow token owner to write data", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = ethers.toUtf8Bytes("hello world");

      await storage.connect(alice).write(tokenId, KEY_A, data);

      const stored = await storage.read(tokenId, KEY_A);
      expect(ethers.toUtf8String(stored)).to.equal("hello world");
    });

    it("Should emit DataWritten event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = ethers.toUtf8Bytes("test");

      await expect(storage.connect(alice).write(tokenId, KEY_A, data))
        .to.emit(storage, "DataWritten")
        .withArgs(tokenId, KEY_A, alice.address);
    });

    it("Should allow granted writer to write data", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = ethers.toUtf8Bytes("from writer");

      await storage.connect(alice).grantWriter(tokenId, writer1.address);
      await storage.connect(writer1).write(tokenId, KEY_A, data);

      const stored = await storage.read(tokenId, KEY_A);
      expect(ethers.toUtf8String(stored)).to.equal("from writer");
    });

    it("Should revert if not writer or owner", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = ethers.toUtf8Bytes("unauthorized");

      await expect(storage.connect(bob).write(tokenId, KEY_A, data))
        .to.be.revertedWithCustomError(storage, "NotWriter");
    });

    it("Should revert if module not active", async function () {
      await deployFixture();
      const tokenId = await mintExo(alice);
      const data = ethers.toUtf8Bytes("test");

      await expect(storage.connect(alice).write(tokenId, KEY_A, data))
        .to.be.revertedWithCustomError(storage, "NotActive");
    });

    it("Should revert on empty key", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const data = ethers.toUtf8Bytes("test");

      await expect(storage.connect(alice).write(tokenId, ethers.ZeroHash, data))
        .to.be.revertedWithCustomError(storage, "KeyEmpty");
    });

    it("Should revert if value exceeds max size", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const bigData = new Uint8Array(1025); // 1025 bytes > 1024 max

      await expect(storage.connect(alice).write(tokenId, KEY_A, bigData))
        .to.be.revertedWithCustomError(storage, "ValueTooLarge");
    });

    it("Should overwrite existing data", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("first"));
      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("second"));

      const stored = await storage.read(tokenId, KEY_A);
      expect(ethers.toUtf8String(stored)).to.equal("second");
    });

    it("Should track write count", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("a"));
      await storage.connect(alice).write(tokenId, KEY_B, ethers.toUtf8Bytes("b"));

      expect(await storage.writeCount(tokenId)).to.equal(2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  KEY ENUMERATION
  // ═══════════════════════════════════════════════════════════════

  describe("Key Enumeration", function () {
    it("Should track keys", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("a"));
      await storage.connect(alice).write(tokenId, KEY_B, ethers.toUtf8Bytes("b"));

      const keys = await storage.getKeys(tokenId);
      expect(keys.length).to.equal(2);
      expect(keys).to.include(KEY_A);
      expect(keys).to.include(KEY_B);
    });

    it("Should not duplicate keys on overwrite", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("first"));
      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("second"));

      expect(await storage.keyCount(tokenId)).to.equal(1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DELETE
  // ═══════════════════════════════════════════════════════════════

  describe("Delete", function () {
    it("Should allow token owner to delete a key", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("data"));
      await storage.connect(alice).deleteKey(tokenId, KEY_A);

      const stored = await storage.read(tokenId, KEY_A);
      expect(stored).to.equal("0x");
    });

    it("Should emit DataDeleted event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("data"));
      await expect(storage.connect(alice).deleteKey(tokenId, KEY_A))
        .to.emit(storage, "DataDeleted")
        .withArgs(tokenId, KEY_A);
    });

    it("Should revert if not token owner (even if writer)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).grantWriter(tokenId, writer1.address);
      await storage.connect(writer1).write(tokenId, KEY_A, ethers.toUtf8Bytes("data"));

      await expect(storage.connect(writer1).deleteKey(tokenId, KEY_A))
        .to.be.revertedWithCustomError(storage, "NotTokenOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  WRITER PERMISSIONS
  // ═══════════════════════════════════════════════════════════════

  describe("Writer Permissions", function () {
    it("Should grant write access", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).grantWriter(tokenId, writer1.address);
      expect(await storage.canWrite(tokenId, writer1.address)).to.equal(true);
    });

    it("Should revoke write access", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).grantWriter(tokenId, writer1.address);
      await storage.connect(alice).revokeWriter(tokenId, writer1.address);
      expect(await storage.canWrite(tokenId, writer1.address)).to.equal(false);
    });

    it("Should emit WriterGranted event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(storage.connect(alice).grantWriter(tokenId, writer1.address))
        .to.emit(storage, "WriterGranted")
        .withArgs(tokenId, writer1.address);
    });

    it("Should emit WriterRevoked event", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await storage.connect(alice).grantWriter(tokenId, writer1.address);
      await expect(storage.connect(alice).revokeWriter(tokenId, writer1.address))
        .to.emit(storage, "WriterRevoked")
        .withArgs(tokenId, writer1.address);
    });

    it("Token owner should always be a writer", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      expect(await storage.canWrite(tokenId, alice.address)).to.equal(true);
    });

    it("Non-owner non-writer should not be able to write", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      expect(await storage.canWrite(tokenId, bob.address)).to.equal(false);
    });

    it("Only token owner can grant writers", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);

      await expect(storage.connect(bob).grantWriter(tokenId, writer1.address))
        .to.be.revertedWithCustomError(storage, "NotTokenOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DATA PERSISTENCE (token-bound)
  // ═══════════════════════════════════════════════════════════════

  describe("Data Persistence", function () {
    it("Should read empty bytes for unset keys", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const stored = await storage.read(tokenId, KEY_A);
      expect(stored).to.equal("0x");
    });

    it("Anyone can read data (public)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      await storage.connect(alice).write(tokenId, KEY_A, ethers.toUtf8Bytes("public data"));

      // bob (not owner, not writer) can read
      const stored = await storage.connect(bob).read(tokenId, KEY_A);
      expect(ethers.toUtf8String(stored)).to.equal("public data");
    });

    it("Should allow max size value (1024 bytes)", async function () {
      await deployFixture();
      const tokenId = await mintAndActivate(alice);
      const maxData = new Uint8Array(1024);
      maxData.fill(0x42);

      await storage.connect(alice).write(tokenId, KEY_A, maxData);

      const stored = await storage.read(tokenId, KEY_A);
      expect(stored.length).to.equal(2 + 1024 * 2); // 0x prefix + hex
    });
  });
});
