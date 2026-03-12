import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ExoConnect", function () {
  let exoConnect, exoCore;
  let owner, alice, bob, charlie;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    // Deploy a mock ERC721 for Exo verification
    const MockERC721 = await ethers.getContractFactory("MockERC721");
    exoCore = await MockERC721.deploy();
    await exoCore.waitForDeployment();

    const ExoConnect = await ethers.getContractFactory("ExoConnect");
    exoConnect = await ExoConnect.deploy(await exoCore.getAddress());
    await exoConnect.waitForDeployment();
  });

  // ─── Registration ───────────────────────────────────────────

  describe("Registration", function () {
    it("should register a user with name and bio", async function () {
      await exoConnect.connect(alice).register("Alice", "Hello world");
      const user = await exoConnect.users(alice.address);
      expect(user.name).to.equal("Alice");
      expect(user.bio).to.equal("Hello world");
      expect(user.registeredAt).to.be.gt(0);
    });

    it("should emit UserRegistered event", async function () {
      await expect(exoConnect.connect(alice).register("Alice", ""))
        .to.emit(exoConnect, "UserRegistered")
        .withArgs(alice.address, "Alice");
    });

    it("should resolve name to address (case insensitive)", async function () {
      await exoConnect.connect(alice).register("Alice", "");
      expect(await exoConnect.resolveByName("alice")).to.equal(alice.address);
      expect(await exoConnect.resolveByName("ALICE")).to.equal(alice.address);
      expect(await exoConnect.resolveByName("Alice")).to.equal(alice.address);
    });

    it("should reject duplicate names (case insensitive)", async function () {
      await exoConnect.connect(alice).register("Alice", "");
      await expect(exoConnect.connect(bob).register("alice", ""))
        .to.be.revertedWithCustomError(exoConnect, "NameTaken");
    });

    it("should reject double registration", async function () {
      await exoConnect.connect(alice).register("Alice", "");
      await expect(exoConnect.connect(alice).register("Alice2", ""))
        .to.be.revertedWithCustomError(exoConnect, "AlreadyRegistered");
    });

    it("should reject empty name", async function () {
      await expect(exoConnect.connect(alice).register("", ""))
        .to.be.revertedWithCustomError(exoConnect, "NameTooShort");
    });

    it("should reject name over 32 chars", async function () {
      await expect(exoConnect.connect(alice).register("a".repeat(33), ""))
        .to.be.revertedWithCustomError(exoConnect, "NameTooLong");
    });

    it("should track user count", async function () {
      expect(await exoConnect.getUserCount()).to.equal(0);
      await exoConnect.connect(alice).register("Alice", "");
      expect(await exoConnect.getUserCount()).to.equal(1);
      await exoConnect.connect(bob).register("Bob", "");
      expect(await exoConnect.getUserCount()).to.equal(2);
    });

    it("should update bio", async function () {
      await exoConnect.connect(alice).register("Alice", "old");
      await exoConnect.connect(alice).setBio("new");
      expect((await exoConnect.users(alice.address)).bio).to.equal("new");
    });

    it("should reject setBio from unregistered user", async function () {
      await expect(exoConnect.connect(alice).setBio("hello"))
        .to.be.revertedWithCustomError(exoConnect, "NotRegistered");
    });
  });

  // ─── Messaging ──────────────────────────────────────────────

  describe("Messaging", function () {
    beforeEach(async function () {
      await exoConnect.connect(alice).register("Alice", "");
      await exoConnect.connect(bob).register("Bob", "");
    });

    it("should send a message", async function () {
      const payload = ethers.toUtf8Bytes("hello bob");
      await exoConnect.connect(alice).sendMessage(bob.address, 0, payload);

      expect(await exoConnect.getMessageCount()).to.equal(1);
      expect(await exoConnect.getInboxCount(bob.address)).to.equal(1);
      expect(await exoConnect.getOutboxCount(alice.address)).to.equal(1);
    });

    it("should emit MessageSent event", async function () {
      const payload = ethers.toUtf8Bytes("hello");
      await expect(exoConnect.connect(alice).sendMessage(bob.address, 0, payload))
        .to.emit(exoConnect, "MessageSent")
        .withArgs(0, alice.address, bob.address, 0);
    });

    it("should track message stats", async function () {
      const payload = ethers.toUtf8Bytes("hi");
      await exoConnect.connect(alice).sendMessage(bob.address, 0, payload);
      await exoConnect.connect(alice).sendMessage(bob.address, 0, payload);

      const aliceUser = await exoConnect.users(alice.address);
      const bobUser = await exoConnect.users(bob.address);
      expect(aliceUser.messagesSent).to.equal(2);
      expect(bobUser.messagesReceived).to.equal(2);
    });

    it("should reject message from unregistered sender", async function () {
      await expect(exoConnect.connect(charlie).sendMessage(bob.address, 0, "0x"))
        .to.be.revertedWithCustomError(exoConnect, "NotRegistered");
    });

    it("should reject message to unregistered recipient", async function () {
      await expect(exoConnect.connect(alice).sendMessage(charlie.address, 0, "0x"))
        .to.be.revertedWithCustomError(exoConnect, "NotRegistered");
    });

    it("should reject self-message", async function () {
      await expect(exoConnect.connect(alice).sendMessage(alice.address, 0, "0x"))
        .to.be.revertedWithCustomError(exoConnect, "SelfMessage");
    });

    it("should support all message types", async function () {
      const payload = ethers.toUtf8Bytes("test");
      for (let t = 0; t <= 4; t++) {
        await exoConnect.connect(alice).sendMessage(bob.address, t, payload);
      }
      expect(await exoConnect.getMessageCount()).to.equal(5);
    });

    it("should retrieve inbox messages with pagination", async function () {
      const p = ethers.toUtf8Bytes("msg");
      await exoConnect.connect(alice).sendMessage(bob.address, 0, p);
      await exoConnect.connect(alice).sendMessage(bob.address, 0, p);
      await exoConnect.connect(alice).sendMessage(bob.address, 0, p);

      const page1 = await exoConnect.getInboxMessages(bob.address, 0, 2);
      expect(page1.length).to.equal(2);

      const page2 = await exoConnect.getInboxMessages(bob.address, 2, 2);
      expect(page2.length).to.equal(1);
    });
  });

  // ─── Broadcast ──────────────────────────────────────────────

  describe("Broadcast", function () {
    it("should broadcast a message", async function () {
      await exoConnect.connect(alice).register("Alice", "");
      const payload = ethers.toUtf8Bytes("hello everyone");
      await expect(exoConnect.connect(alice).broadcast(0, payload))
        .to.emit(exoConnect, "Broadcast")
        .withArgs(0, alice.address);

      expect(await exoConnect.getMessageCount()).to.equal(1);
      expect(await exoConnect.getOutboxCount(alice.address)).to.equal(1);
    });

    it("should reject broadcast from unregistered user", async function () {
      await expect(exoConnect.connect(alice).broadcast(0, "0x"))
        .to.be.revertedWithCustomError(exoConnect, "NotRegistered");
    });
  });

  // ─── Inbox Fee ──────────────────────────────────────────────

  describe("Inbox Fee", function () {
    beforeEach(async function () {
      await exoConnect.connect(alice).register("Alice", "");
      await exoConnect.connect(bob).register("Bob", "");
    });

    it("should set inbox fee", async function () {
      const fee = ethers.parseEther("0.001");
      await exoConnect.connect(bob).setInboxFee(fee);
      expect((await exoConnect.users(bob.address)).inboxFee).to.equal(fee);
    });

    it("should require fee for non-Exo senders", async function () {
      const fee = ethers.parseEther("0.001");
      await exoConnect.connect(bob).setInboxFee(fee);

      await expect(
        exoConnect.connect(alice).sendMessage(bob.address, 0, "0x")
      ).to.be.revertedWithCustomError(exoConnect, "InsufficientFee");
    });

    it("should accept message with correct fee", async function () {
      const fee = ethers.parseEther("0.001");
      await exoConnect.connect(bob).setInboxFee(fee);

      const bobBalBefore = await ethers.provider.getBalance(bob.address);
      await exoConnect.connect(alice).sendMessage(bob.address, 0, "0x", { value: fee });
      const bobBalAfter = await ethers.provider.getBalance(bob.address);

      // Fee goes to bob, not treasury
      expect(bobBalAfter - bobBalBefore).to.equal(fee);
      expect(await exoConnect.getInboxCount(bob.address)).to.equal(1);
    });

    it("should let Exo holders bypass inbox fee", async function () {
      const fee = ethers.parseEther("0.001");
      await exoConnect.connect(bob).setInboxFee(fee);

      // Mint an Exo for alice
      await exoCore.mint(alice.address);

      // Alice can message bob for free
      await exoConnect.connect(alice).sendMessage(bob.address, 0, "0x");
      expect(await exoConnect.getInboxCount(bob.address)).to.equal(1);
    });
  });

  // ─── Exo Verification ──────────────────────────────────────

  describe("Exo Verification", function () {
    it("should detect Exo holders as verified", async function () {
      await exoConnect.connect(alice).register("Alice", "");
      expect(await exoConnect.isVerified(alice.address)).to.equal(false);

      await exoCore.mint(alice.address);
      expect(await exoConnect.isVerified(alice.address)).to.equal(true);
    });

    it("should return false for unregistered Exo holder", async function () {
      await exoCore.mint(alice.address);
      expect(await exoConnect.isVerified(alice.address)).to.equal(false);
    });
  });

  // ─── User Directory ─────────────────────────────────────────

  describe("User Directory", function () {
    it("should paginate users", async function () {
      await exoConnect.connect(alice).register("Alice", "");
      await exoConnect.connect(bob).register("Bob", "");
      await exoConnect.connect(charlie).register("Charlie", "");

      const [addrs, data] = await exoConnect.getUsers(0, 2);
      expect(addrs.length).to.equal(2);
      expect(data[0].name).to.equal("Alice");
      expect(data[1].name).to.equal("Bob");

      const [addrs2, data2] = await exoConnect.getUsers(2, 5);
      expect(addrs2.length).to.equal(1);
      expect(data2[0].name).to.equal("Charlie");
    });
  });
});
