import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

/**
 * XMTP Signer — Interface & Signing Tests
 *
 * Pure signer validation — no XMTP network, no live RPC.
 * Uses a mock Exoskeleton instance to avoid onchain calls.
 */

// Dynamic import for ESM modules
const { createExoSigner, validateExoForXMTP } = await import("../xmtp/signer.js");

// ─── Test constants ──────────────────────────────────────────

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat #0
const TEST_WALLET = new ethers.Wallet(TEST_PRIVATE_KEY);
const TBA_ADDRESS = "0x1111111111111111111111111111111111111111";

// ─── Mock Exoskeleton ────────────────────────────────────────

function createMockExo(options = {}) {
  const {
    tbaAddress = TBA_ADDRESS,
    hasWallet = true,
    erc1271 = true,
  } = options;

  return {
    async getWalletAddress(tokenId) {
      return tbaAddress;
    },
    async hasWallet(tokenId) {
      return hasWallet;
    },
    async tbaSupportsERC1271(tokenId) {
      return erc1271;
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe("XMTP Signer", function () {

  // ═══════════════════════════════════════════════════════════════
  //  Signer Interface
  // ═══════════════════════════════════════════════════════════════

  describe("Signer interface", function () {
    let signer;

    beforeEach(async function () {
      signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });
    });

    it("Should have type 'SCW'", function () {
      expect(signer.type).to.equal("SCW");
    });

    it("Should have getIdentifier function", function () {
      expect(typeof signer.getIdentifier).to.equal("function");
    });

    it("Should have signMessage function", function () {
      expect(typeof signer.signMessage).to.equal("function");
    });

    it("Should have getChainId function", function () {
      expect(typeof signer.getChainId).to.equal("function");
    });

    it("Should return Base chain ID (8453n)", function () {
      expect(signer.getChainId()).to.equal(8453n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  getIdentifier
  // ═══════════════════════════════════════════════════════════════

  describe("getIdentifier", function () {
    it("Should return lowercased TBA address", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo({ tbaAddress: "0xABCD1234ABCD1234ABCD1234ABCD1234ABCD1234" }),
      });

      const id = signer.getIdentifier();
      expect(id.identifier).to.equal("0xabcd1234abcd1234abcd1234abcd1234abcd1234");
    });

    it("Should include identifierKind for Ethereum", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });

      const id = signer.getIdentifier();
      // IdentifierKind.Ethereum = 1
      expect(id.identifierKind).to.be.a("number");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  signMessage
  // ═══════════════════════════════════════════════════════════════

  describe("signMessage", function () {
    it("Should return a Uint8Array", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });

      const sig = await signer.signMessage("test message");
      expect(sig).to.be.instanceOf(Uint8Array);
    });

    it("Should return a 65-byte signature", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });

      const sig = await signer.signMessage("test message");
      expect(sig.length).to.equal(65);
    });

    it("Should produce a valid EIP-191 signature", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });

      const message = "Hello XMTP from Exo #1";
      const sig = await signer.signMessage(message);
      const sigHex = ethers.hexlify(sig);

      // Recover the signer address from the signature
      const recovered = ethers.verifyMessage(message, sigHex);
      expect(recovered.toLowerCase()).to.equal(TEST_WALLET.address.toLowerCase());
    });

    it("Should produce different signatures for different messages", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });

      const sig1 = await signer.signMessage("message 1");
      const sig2 = await signer.signMessage("message 2");

      expect(ethers.hexlify(sig1)).to.not.equal(ethers.hexlify(sig2));
    });

    it("Should produce consistent signatures for the same message", async function () {
      const signer = await createExoSigner(1, {
        privateKey: TEST_PRIVATE_KEY,
        _exoskeleton: createMockExo(),
      });

      const sig1 = await signer.signMessage("same message");
      const sig2 = await signer.signMessage("same message");

      expect(ethers.hexlify(sig1)).to.equal(ethers.hexlify(sig2));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  Error cases
  // ═══════════════════════════════════════════════════════════════

  describe("Error handling", function () {
    it("Should throw if no key or apiKey provided", async function () {
      try {
        await createExoSigner(1, { _exoskeleton: createMockExo() });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.message).to.include("privateKey or bankrApiKey");
      }
    });

    it("Should throw if TBA is not activated", async function () {
      try {
        await createExoSigner(1, {
          privateKey: TEST_PRIVATE_KEY,
          _exoskeleton: createMockExo({ hasWallet: false }),
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.message).to.include("not activated");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  validateExoForXMTP
  // ═══════════════════════════════════════════════════════════════

  describe("validateExoForXMTP", function () {
    it("Should return valid=true for activated TBA with ERC-1271", async function () {
      const result = await validateExoForXMTP(1, {
        _exoskeleton: createMockExo(),
      });
      expect(result.valid).to.equal(true);
      expect(result.tbaAddress).to.equal(TBA_ADDRESS);
      expect(result.issues).to.have.lengthOf(0);
    });

    it("Should return valid=false if TBA not activated", async function () {
      const result = await validateExoForXMTP(1, {
        _exoskeleton: createMockExo({ hasWallet: false }),
      });
      expect(result.valid).to.equal(false);
      expect(result.issues).to.include("TBA not activated");
    });

    it("Should flag ERC-1271 not supported", async function () {
      const result = await validateExoForXMTP(1, {
        _exoskeleton: createMockExo({ erc1271: false }),
      });
      expect(result.valid).to.equal(false);
      expect(result.issues).to.include("ERC-1271 not supported on TBA");
    });

    it("Should flag ERC-1271 inconclusive", async function () {
      const result = await validateExoForXMTP(1, {
        _exoskeleton: createMockExo({ erc1271: null }),
      });
      expect(result.valid).to.equal(false);
      expect(result.issues[0]).to.include("inconclusive");
    });

    it("Should return tbaAddress in result", async function () {
      const customAddr = "0x9999999999999999999999999999999999999999";
      const result = await validateExoForXMTP(1, {
        _exoskeleton: createMockExo({ tbaAddress: customAddr }),
      });
      expect(result.tbaAddress).to.equal(customAddr);
    });
  });
});
