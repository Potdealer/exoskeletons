import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

/**
 * TBA Tools — Calldata Encoding Tests
 *
 * These tests verify that all TBA transaction builders produce correct
 * calldata. They decode the outer TBA execute() wrapper and the inner
 * target calldata to verify correctness.
 *
 * No onchain deployment needed — pure encoding/decoding tests.
 */

// ABI interfaces for decoding
const TBA_ABI = [
  "function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes)",
  "function executeBatch((address to, uint256 value, bytes data, uint8 operation)[] operations) payable returns (bytes[])",
];
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const ERC721_ABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
];

const tbaIface = new ethers.Interface(TBA_ABI);
const erc20Iface = new ethers.Interface(ERC20_ABI);
const erc721Iface = new ethers.Interface(ERC721_ABI);

// ─── Import SDK standalone builders ───────────────────────────

// Use dynamic import since sdk/index.js is ESM
const sdk = await import("../sdk/index.js");

// Test addresses
const TBA_ADDR = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const SPENDER = "0x4444444444444444444444444444444444444444";
const TOKEN_ADDR = "0x5555555555555555555555555555555555555555";
const NFT_ADDR = "0x6666666666666666666666666666666666666666";

/** Decode the outer TBA execute() call */
function decodeExecute(data) {
  const decoded = tbaIface.decodeFunctionData("execute", data);
  return { to: decoded[0], value: decoded[1], data: decoded[2], operation: decoded[3] };
}

/** Decode the outer TBA executeBatch() call */
function decodeBatch(data) {
  const decoded = tbaIface.decodeFunctionData("executeBatch", data);
  return decoded[0].map(op => ({ to: op.to, value: op.value, data: op.data, operation: op.operation }));
}

describe("TBA Tools — Calldata Encoding", function () {

  // ═══════════════════════════════════════════════════════════════
  //  buildTBAExecuteTx (SDK standalone)
  // ═══════════════════════════════════════════════════════════════

  describe("buildTBAExecuteTx", function () {
    it("Should wrap inner calldata in execute(target, value, data, 0)", function () {
      const innerData = erc20Iface.encodeFunctionData("transfer", [RECIPIENT, 1000n]);
      const tx = sdk.buildTBAExecuteTx(TBA_ADDR, TARGET, innerData, "0");

      expect(tx.to).to.equal(TBA_ADDR);
      expect(tx.chainId).to.equal(8453);

      const outer = decodeExecute(tx.data);
      expect(outer.to).to.equal(TARGET);
      expect(outer.value).to.equal(0n);
      expect(outer.data).to.equal(innerData);
      expect(outer.operation).to.equal(0n);
    });

    it("Should pass inner value correctly", function () {
      const tx = sdk.buildTBAExecuteTx(TBA_ADDR, TARGET, "0x", ethers.parseEther("1.5").toString());

      const outer = decodeExecute(tx.data);
      expect(outer.to).to.equal(TARGET);
      expect(outer.value).to.equal(ethers.parseEther("1.5"));
      expect(outer.data).to.equal("0x");
    });

    it("Should default inner value to 0", function () {
      const tx = sdk.buildTBAExecuteTx(TBA_ADDR, TARGET, "0x");

      const outer = decodeExecute(tx.data);
      expect(outer.value).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  encodeTBATransferERC20
  // ═══════════════════════════════════════════════════════════════

  describe("encodeTBATransferERC20", function () {
    it("Should encode ERC-20 transfer correctly", function () {
      const amount = ethers.parseUnits("100", 18);
      const result = sdk.encodeTBATransferERC20(TOKEN_ADDR, RECIPIENT, amount);

      expect(result.target).to.equal(TOKEN_ADDR);

      const decoded = erc20Iface.decodeFunctionData("transfer", result.data);
      expect(decoded[0]).to.equal(RECIPIENT);
      expect(decoded[1]).to.equal(amount);
    });

    it("Should handle zero amount", function () {
      const result = sdk.encodeTBATransferERC20(TOKEN_ADDR, RECIPIENT, 0n);
      const decoded = erc20Iface.decodeFunctionData("transfer", result.data);
      expect(decoded[1]).to.equal(0n);
    });

    it("Should handle max uint256 amount", function () {
      const maxUint = 2n ** 256n - 1n;
      const result = sdk.encodeTBATransferERC20(TOKEN_ADDR, RECIPIENT, maxUint);
      const decoded = erc20Iface.decodeFunctionData("transfer", result.data);
      expect(decoded[1]).to.equal(maxUint);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  encodeTBATransferNFT
  // ═══════════════════════════════════════════════════════════════

  describe("encodeTBATransferNFT", function () {
    it("Should encode safeTransferFrom with from = TBA address", function () {
      const result = sdk.encodeTBATransferNFT(NFT_ADDR, TBA_ADDR, RECIPIENT, 42);

      expect(result.target).to.equal(NFT_ADDR);

      const decoded = erc721Iface.decodeFunctionData("safeTransferFrom", result.data);
      expect(decoded[0]).to.equal(TBA_ADDR); // from = TBA
      expect(decoded[1]).to.equal(RECIPIENT);
      expect(decoded[2]).to.equal(42n);
    });

    it("Should handle large token IDs", function () {
      const bigId = 999999n;
      const result = sdk.encodeTBATransferNFT(NFT_ADDR, TBA_ADDR, RECIPIENT, bigId);
      const decoded = erc721Iface.decodeFunctionData("safeTransferFrom", result.data);
      expect(decoded[2]).to.equal(bigId);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  buildTBABatchExecuteTx
  // ═══════════════════════════════════════════════════════════════

  describe("buildTBABatchExecuteTx", function () {
    it("Should encode a batch of operations as tuple array", function () {
      const transferData = erc20Iface.encodeFunctionData("transfer", [RECIPIENT, 1000n]);
      const approveData = erc20Iface.encodeFunctionData("approve", [SPENDER, 5000n]);

      const tx = sdk.buildTBABatchExecuteTx(TBA_ADDR, [
        { target: TOKEN_ADDR, value: "0", data: transferData },
        { target: TOKEN_ADDR, value: "0", data: approveData },
      ]);

      expect(tx.to).to.equal(TBA_ADDR);

      const ops = decodeBatch(tx.data);
      expect(ops.length).to.equal(2);

      expect(ops[0].to).to.equal(TOKEN_ADDR);
      expect(ops[0].value).to.equal(0n);
      expect(ops[0].operation).to.equal(0n);

      // Verify inner calldata
      const inner0 = erc20Iface.decodeFunctionData("transfer", ops[0].data);
      expect(inner0[0]).to.equal(RECIPIENT);
      expect(inner0[1]).to.equal(1000n);

      const inner1 = erc20Iface.decodeFunctionData("approve", ops[1].data);
      expect(inner1[0]).to.equal(SPENDER);
      expect(inner1[1]).to.equal(5000n);
    });

    it("Should handle single operation batch", function () {
      const tx = sdk.buildTBABatchExecuteTx(TBA_ADDR, [
        { target: RECIPIENT, value: ethers.parseEther("0.1").toString(), data: "0x" },
      ]);

      const ops = decodeBatch(tx.data);
      expect(ops.length).to.equal(1);
      expect(ops[0].to).to.equal(RECIPIENT);
      expect(ops[0].value).to.equal(ethers.parseEther("0.1"));
    });

    it("Should default value and data for operations", function () {
      const tx = sdk.buildTBABatchExecuteTx(TBA_ADDR, [
        { target: RECIPIENT },
      ]);

      const ops = decodeBatch(tx.data);
      expect(ops[0].value).to.equal(0n);
      expect(ops[0].data).to.equal("0x");
    });

    it("Should handle mixed ETH + token operations", function () {
      const transferData = erc20Iface.encodeFunctionData("transfer", [RECIPIENT, 500n]);

      const tx = sdk.buildTBABatchExecuteTx(TBA_ADDR, [
        { target: RECIPIENT, value: ethers.parseEther("0.5").toString() },
        { target: TOKEN_ADDR, data: transferData },
      ]);

      const ops = decodeBatch(tx.data);
      expect(ops.length).to.equal(2);
      expect(ops[0].value).to.equal(ethers.parseEther("0.5"));
      expect(ops[1].value).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  End-to-end: compose helpers → execute
  // ═══════════════════════════════════════════════════════════════

  describe("End-to-end composition", function () {
    it("Should compose encodeTBATransferERC20 into buildTBAExecuteTx", function () {
      const amount = ethers.parseUnits("50", 6); // USDC-like
      const inner = sdk.encodeTBATransferERC20(TOKEN_ADDR, RECIPIENT, amount);
      const tx = sdk.buildTBAExecuteTx(TBA_ADDR, inner.target, inner.data);

      // Decode outer
      const outer = decodeExecute(tx.data);
      expect(outer.to).to.equal(TOKEN_ADDR);
      expect(outer.value).to.equal(0n);

      // Decode inner
      const decoded = erc20Iface.decodeFunctionData("transfer", outer.data);
      expect(decoded[0]).to.equal(RECIPIENT);
      expect(decoded[1]).to.equal(amount);
    });

    it("Should compose encodeTBATransferNFT into buildTBAExecuteTx", function () {
      const inner = sdk.encodeTBATransferNFT(NFT_ADDR, TBA_ADDR, RECIPIENT, 7);
      const tx = sdk.buildTBAExecuteTx(TBA_ADDR, inner.target, inner.data);

      const outer = decodeExecute(tx.data);
      expect(outer.to).to.equal(NFT_ADDR);

      const decoded = erc721Iface.decodeFunctionData("safeTransferFrom", outer.data);
      expect(decoded[0]).to.equal(TBA_ADDR);
      expect(decoded[1]).to.equal(RECIPIENT);
      expect(decoded[2]).to.equal(7n);
    });

    it("Should compose multiple helpers into buildTBABatchExecuteTx", function () {
      const erc20Inner = sdk.encodeTBATransferERC20(TOKEN_ADDR, RECIPIENT, 1000n);
      const nftInner = sdk.encodeTBATransferNFT(NFT_ADDR, TBA_ADDR, RECIPIENT, 99);

      const tx = sdk.buildTBABatchExecuteTx(TBA_ADDR, [
        { target: erc20Inner.target, data: erc20Inner.data },
        { target: nftInner.target, data: nftInner.data },
      ]);

      const ops = decodeBatch(tx.data);
      expect(ops.length).to.equal(2);

      // Verify ERC-20 transfer
      const erc20Decoded = erc20Iface.decodeFunctionData("transfer", ops[0].data);
      expect(erc20Decoded[0]).to.equal(RECIPIENT);

      // Verify NFT transfer
      const nftDecoded = erc721Iface.decodeFunctionData("safeTransferFrom", ops[1].data);
      expect(nftDecoded[0]).to.equal(TBA_ADDR);
      expect(nftDecoded[2]).to.equal(99n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ABI exports
  // ═══════════════════════════════════════════════════════════════

  describe("ABI exports", function () {
    it("Should export TBAV3ABI with execute and executeBatch", function () {
      expect(sdk.TBAV3ABI).to.be.an("array");
      const iface = new ethers.Interface(sdk.TBAV3ABI);
      expect(iface.getFunction("execute")).to.not.be.null;
      expect(iface.getFunction("executeBatch")).to.not.be.null;
      expect(iface.getFunction("owner")).to.not.be.null;
      expect(iface.getFunction("isValidSignature")).to.not.be.null;
    });

    it("Should export ERC20TransferABI with transfer, approve, balanceOf", function () {
      expect(sdk.ERC20TransferABI).to.be.an("array");
      const iface = new ethers.Interface(sdk.ERC20TransferABI);
      expect(iface.getFunction("transfer")).to.not.be.null;
      expect(iface.getFunction("approve")).to.not.be.null;
      expect(iface.getFunction("balanceOf")).to.not.be.null;
    });

    it("Should export ERC721TransferABI with safeTransferFrom and ownerOf", function () {
      expect(sdk.ERC721TransferABI).to.be.an("array");
      const iface = new ethers.Interface(sdk.ERC721TransferABI);
      expect(iface.getFunction("safeTransferFrom")).to.not.be.null;
      expect(iface.getFunction("ownerOf")).to.not.be.null;
    });
  });
});
