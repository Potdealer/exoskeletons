/**
 * Exoskeleton Module SDK — JavaScript Utilities
 *
 * Helpers for building, deploying, and interacting with Exoskeleton modules.
 *
 * Usage:
 *   import { moduleKey, IExoModuleABI, BaseModuleABI } from './sdk/index.js';
 *
 *   const key = moduleKey("my-module");
 *   // key === keccak256(toUtf8Bytes("my-module"))
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

import { ethers } from "ethers";

// ─── Addresses (Base Mainnet) ──────────────────────────────────

export const ADDRESSES = {
  core: "0x8241BDD5009ed3F6C99737D2415994B58296Da0d",
  renderer: "0xf000dF16982EAc46f1168ea2C9DE820BCbC5287d",
  registry: "0x46fd56417dcd08cA8de1E12dd6e7f7E1b791B3E9",
  wallet: "0x78aF4B6D78a116dEDB3612A30365718B076894b9",
  marketplace: "0x0E760171da676c219F46f289901D0be1CBD06188",
  chainId: 8453,
};

// ─── Key Utilities ─────────────────────────────────────────────

/**
 * Compute the bytes32 module key from a human-readable name.
 * This matches how ExoskeletonCore and ModuleMarketplace identify modules.
 *
 * @param {string} name - Module name (e.g. "storage-vault")
 * @returns {string} bytes32 hex string
 */
export function moduleKey(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

/**
 * Compute a score type key from a human-readable name.
 * Used with ScoreModule for score categories.
 *
 * @param {string} name - Score type (e.g. "elo", "wins")
 * @returns {string} bytes32 hex string
 */
export function scoreKey(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

/**
 * Compute a storage key from a human-readable name.
 * Used with StorageModule for data keys.
 *
 * @param {string} name - Key name (e.g. "agent-memory", "config")
 * @returns {string} bytes32 hex string
 */
export function storageKey(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

// ─── ABIs ──────────────────────────────────────────────────────

export const IExoModuleABI = [
  "function moduleName() view returns (string)",
  "function moduleVersion() view returns (string)",
  "function moduleDescription() view returns (string)",
  "function builder() view returns (address)",
  "function moduleKey() view returns (bytes32)",
  "function isExoModule() pure returns (bool)",
  "function onActivate(uint256 tokenId)",
  "function onDeactivate(uint256 tokenId)",
  "function isActiveFor(uint256 tokenId) view returns (bool)",
];

export const StorageModuleABI = [
  ...IExoModuleABI,
  "function write(uint256 tokenId, bytes32 key, bytes value)",
  "function deleteKey(uint256 tokenId, bytes32 key)",
  "function read(uint256 tokenId, bytes32 key) view returns (bytes)",
  "function getKeys(uint256 tokenId) view returns (bytes32[])",
  "function keyCount(uint256 tokenId) view returns (uint256)",
  "function grantWriter(uint256 tokenId, address writer)",
  "function revokeWriter(uint256 tokenId, address writer)",
  "function canWrite(uint256 tokenId, address addr) view returns (bool)",
  "function writeCount(uint256 tokenId) view returns (uint256)",
  "event DataWritten(uint256 indexed tokenId, bytes32 indexed key, address writer)",
  "event DataDeleted(uint256 indexed tokenId, bytes32 indexed key)",
  "event WriterGranted(uint256 indexed tokenId, address indexed writer)",
  "event WriterRevoked(uint256 indexed tokenId, address indexed writer)",
];

export const ScoreModuleABI = [
  ...IExoModuleABI,
  "function setScore(uint256 tokenId, bytes32 scoreType, int256 value)",
  "function incrementScore(uint256 tokenId, bytes32 scoreType, int256 delta)",
  "function getScore(uint256 tokenId, bytes32 scoreType) view returns (int256)",
  "function getScoreTypes(uint256 tokenId) view returns (bytes32[])",
  "function getAllScores(uint256 tokenId) view returns (bytes32[], int256[])",
  "function grantScorer(uint256 tokenId, address scorer)",
  "function revokeScorer(uint256 tokenId, address scorer)",
  "function canScore(uint256 tokenId, address addr) view returns (bool)",
  "function updateCount(uint256 tokenId) view returns (uint256)",
  "event ScoreSet(uint256 indexed tokenId, bytes32 indexed scoreType, int256 value, address scorer)",
  "event ScoreIncremented(uint256 indexed tokenId, bytes32 indexed scoreType, int256 delta, int256 newValue)",
  "event ScorerGranted(uint256 indexed tokenId, address indexed scorer)",
  "event ScorerRevoked(uint256 indexed tokenId, address indexed scorer)",
];

export const MarketplaceABI = [
  "function registerBuilder(string name, string bio)",
  "function submitModule(bytes32 moduleName, string name, string description, string version, uint256 price) payable",
  "function activateModule(uint256 tokenId, bytes32 moduleName) payable",
  "function deactivateModule(uint256 tokenId, bytes32 moduleName)",
  "function getModule(bytes32 moduleName) view returns (address builder, string name, string description, string version, uint256 price, uint8 status, uint256 submittedAt, uint256 approvedAt, uint256 totalActivations, uint256 totalRevenue)",
  "function isModuleActive(uint256 tokenId, bytes32 moduleName) view returns (bool)",
  "function getTokenActiveModules(uint256 tokenId) view returns (bytes32[])",
];

// ─── Transaction Builders (for Bankr / signing services) ───────

/**
 * Build a transaction object for activating a module on the module contract.
 * Call this AFTER activating on Core/Marketplace.
 *
 * @param {string} moduleAddress - Deployed module contract address
 * @param {number|bigint} tokenId - Exoskeleton token ID
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildActivateTx(moduleAddress, tokenId) {
  const iface = new ethers.Interface(IExoModuleABI);
  return {
    to: moduleAddress,
    data: iface.encodeFunctionData("onActivate", [tokenId]),
    value: "0",
    chainId: ADDRESSES.chainId,
  };
}

/**
 * Build a transaction object for deactivating a module on the module contract.
 *
 * @param {string} moduleAddress - Deployed module contract address
 * @param {number|bigint} tokenId - Exoskeleton token ID
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildDeactivateTx(moduleAddress, tokenId) {
  const iface = new ethers.Interface(IExoModuleABI);
  return {
    to: moduleAddress,
    data: iface.encodeFunctionData("onDeactivate", [tokenId]),
    value: "0",
    chainId: ADDRESSES.chainId,
  };
}

/**
 * Build a transaction for marketplace module submission.
 *
 * @param {string} name - Module name (human-readable, will be keccak256'd)
 * @param {string} displayName - Display name for marketplace
 * @param {string} description - Module description
 * @param {string} version - Version string
 * @param {bigint} price - Price in wei (0n for free)
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildSubmitModuleTx(name, displayName, description, version, price = 0n) {
  const iface = new ethers.Interface(MarketplaceABI);
  const key = moduleKey(name);
  return {
    to: ADDRESSES.marketplace,
    data: iface.encodeFunctionData("submitModule", [
      key, displayName, description, version, price,
    ]),
    value: ethers.parseEther("0.001").toString(), // listing fee
    chainId: ADDRESSES.chainId,
  };
}

/**
 * Build a transaction for writing data to StorageModule.
 *
 * @param {string} moduleAddress - Deployed StorageModule address
 * @param {number|bigint} tokenId - Exoskeleton token ID
 * @param {string} key - Human-readable key name
 * @param {string|Uint8Array} value - Data to store (string will be UTF-8 encoded)
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildStorageWriteTx(moduleAddress, tokenId, key, value) {
  const iface = new ethers.Interface(StorageModuleABI);
  const keyHash = storageKey(key);
  const valueBytes = typeof value === "string" ? ethers.toUtf8Bytes(value) : value;
  return {
    to: moduleAddress,
    data: iface.encodeFunctionData("write", [tokenId, keyHash, valueBytes]),
    value: "0",
    chainId: ADDRESSES.chainId,
  };
}

/**
 * Build a transaction for setting a score on ScoreModule.
 *
 * @param {string} moduleAddress - Deployed ScoreModule address
 * @param {number|bigint} tokenId - Exoskeleton token ID
 * @param {string} scoreType - Human-readable score type (e.g. "elo")
 * @param {bigint} scoreValue - Score value
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildSetScoreTx(moduleAddress, tokenId, scoreType, scoreValue) {
  const iface = new ethers.Interface(ScoreModuleABI);
  const typeHash = scoreKey(scoreType);
  return {
    to: moduleAddress,
    data: iface.encodeFunctionData("setScore", [tokenId, typeHash, scoreValue]),
    value: "0",
    chainId: ADDRESSES.chainId,
  };
}

// ─── TBA (Token Bound Account) ABIs ────────────────────────────

export const TBAV3ABI = [
  "function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes)",
  "function executeBatch((address to, uint256 value, bytes data, uint8 operation)[] operations) payable returns (bytes[])",
  "function owner() view returns (address)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
];

export const ERC20TransferABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

export const ERC721TransferABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

// ─── TBA Transaction Builders (standalone, no class instance) ──

/**
 * Build a TBA execute transaction. Wraps inner calldata in Tokenbound's execute().
 * @param {string} tbaAddress - The TBA contract address
 * @param {string} target - Target contract to call
 * @param {string} innerData - Encoded calldata for the target
 * @param {string} innerValue - ETH value for the inner call (default "0")
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildTBAExecuteTx(tbaAddress, target, innerData, innerValue = "0") {
  const iface = new ethers.Interface(TBAV3ABI);
  return {
    to: tbaAddress,
    data: iface.encodeFunctionData("execute", [target, innerValue, innerData, 0]),
    value: "0",
    chainId: ADDRESSES.chainId,
  };
}

/**
 * Build a TBA batch execute transaction.
 * @param {string} tbaAddress - The TBA contract address
 * @param {{ target: string, value?: string, data?: string }[]} operations
 * @returns {{ to: string, data: string, value: string, chainId: number }}
 */
export function buildTBABatchExecuteTx(tbaAddress, operations) {
  const iface = new ethers.Interface(TBAV3ABI);
  const tuples = operations.map(op => ({
    to: op.target,
    value: op.value || "0",
    data: op.data || "0x",
    operation: 0,
  }));
  return {
    to: tbaAddress,
    data: iface.encodeFunctionData("executeBatch", [tuples]),
    value: "0",
    chainId: ADDRESSES.chainId,
  };
}

/**
 * Encode an ERC-20 transfer as inner calldata for TBA execute.
 * @param {string} tokenAddress - ERC-20 token contract
 * @param {string} recipient - Recipient address
 * @param {bigint|string} amount - Amount in wei
 * @returns {{ target: string, data: string }}
 */
export function encodeTBATransferERC20(tokenAddress, recipient, amount) {
  const iface = new ethers.Interface(ERC20TransferABI);
  return {
    target: tokenAddress,
    data: iface.encodeFunctionData("transfer", [recipient, amount]),
  };
}

/**
 * Encode an ERC-721 safeTransferFrom as inner calldata for TBA execute.
 * @param {string} nftContract - ERC-721 contract address
 * @param {string} from - Current owner (the TBA address)
 * @param {string} recipient - Recipient address
 * @param {number|bigint} nftTokenId - NFT token ID
 * @returns {{ target: string, data: string }}
 */
export function encodeTBATransferNFT(nftContract, from, recipient, nftTokenId) {
  const iface = new ethers.Interface(ERC721TransferABI);
  return {
    target: nftContract,
    data: iface.encodeFunctionData("safeTransferFrom", [from, recipient, nftTokenId]),
  };
}
