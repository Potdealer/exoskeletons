/**
 * Read an Exoskeleton's full profile — example script.
 *
 * Usage: node examples/read-profile.js [tokenId]
 *
 * Defaults to Exo #1 if no tokenId provided.
 */

import { ethers } from 'ethers';

const RPC = 'https://base-rpc.publicnode.com';
const EXO_READER = '0x334F8F78D0255228d388036560f1D1516fBD09a5';
const EXO_CORE = '0x8241BDD5009ed3F6C99737D2415994B58296Da0d';

const READER_ABI = [
  'function getProfile(uint256 tokenId) view returns (string name, string bio, bytes config, uint256 reputation, uint256 elo, bytes32[] modules, uint256 walletBalance)',
];

const CORE_ABI = [
  'function getIdentity(uint256 tokenId) view returns (string name, string bio, bytes visualConfig, string customVisualKey, uint256 mintedAt, bool genesis)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function totalSupply() view returns (uint256)',
];

async function main() {
  const tokenId = parseInt(process.argv[2]) || 1;
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log(`Reading Exoskeleton #${tokenId}...\n`);

  const core = new ethers.Contract(EXO_CORE, CORE_ABI, provider);

  // Check supply
  const supply = await core.totalSupply();
  console.log(`Total supply: ${supply}`);

  if (tokenId > Number(supply)) {
    console.error(`Token #${tokenId} does not exist (supply: ${supply})`);
    process.exit(1);
  }

  // Owner
  const owner = await core.ownerOf(tokenId);
  console.log(`Owner: ${owner}`);

  // Try ExoReader first, fall back to Core
  try {
    const reader = new ethers.Contract(EXO_READER, READER_ABI, provider);
    const profile = await reader.getProfile(tokenId);
    console.log(`\n--- Profile ---`);
    console.log(`Name:       ${profile.name || '(unnamed)'}`);
    console.log(`Bio:        ${profile.bio || '(none)'}`);
    console.log(`Config:     ${profile.config}`);
    console.log(`Reputation: ${profile.reputation}`);
    console.log(`ELO:        ${profile.elo}`);
    console.log(`Modules:    ${profile.modules.length}`);
    console.log(`Wallet:     ${ethers.formatEther(profile.walletBalance)} ETH`);
  } catch {
    // Fall back to core identity
    const identity = await core.getIdentity(tokenId);
    console.log(`\n--- Identity (Core) ---`);
    console.log(`Name:     ${identity.name || '(unnamed)'}`);
    console.log(`Bio:      ${identity.bio || '(none)'}`);
    console.log(`Config:   ${identity.visualConfig}`);
    console.log(`MintedAt: ${new Date(Number(identity.mintedAt) * 1000).toISOString()}`);
    console.log(`Genesis:  ${identity.genesis}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
