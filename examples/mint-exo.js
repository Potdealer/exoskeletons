/**
 * Mint an Exoskeleton — example script.
 *
 * Usage: PRIVATE_KEY=0x... node examples/mint-exo.js
 *
 * Requires: ethers (npm install ethers)
 */

import { ethers } from 'ethers';
import { ADDRESSES } from '../sdk/index.js';

const RPC = 'https://base-rpc.publicnode.com';

const CORE_ABI = [
  'function mint(bytes config) payable',
  'function getMintPrice() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Minting from: ${wallet.address}`);

  const core = new ethers.Contract(ADDRESSES.core, CORE_ABI, wallet);

  // Get mint price
  const price = await core.getMintPrice();
  console.log(`Mint price: ${ethers.formatEther(price)} ETH`);

  // Generate a random 9-byte visual config
  const config = ethers.randomBytes(9);
  console.log(`Config: 0x${Buffer.from(config).toString('hex')}`);

  // Mint
  console.log('Sending mint transaction...');
  const tx = await core.mint(config, { value: price });
  console.log(`TX: https://basescan.org/tx/${tx.hash}`);

  const receipt = await tx.wait();
  const transferLog = receipt.logs.find(l =>
    l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  );
  const tokenId = transferLog ? Number(BigInt(transferLog.topics[3])) : '?';
  console.log(`Minted Exoskeleton #${tokenId}`);
}

main().catch(e => { console.error(e); process.exit(1); });
