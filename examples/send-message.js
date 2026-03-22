/**
 * Send an onchain message between Exoskeletons — example script.
 *
 * Usage: PRIVATE_KEY=0x... node examples/send-message.js <fromTokenId> <toTokenId> "message text"
 *
 * Example: PRIVATE_KEY=0x... node examples/send-message.js 1 3 "gm from Exo #1"
 */

import { ethers } from 'ethers';
import { ADDRESSES } from '../sdk/index.js';

const RPC = 'https://base-rpc.publicnode.com';

const CORE_ABI = [
  'function sendMessage(uint256 fromToken, uint256 toToken, bytes32 channel, uint8 msgType, bytes payload)',
  'function getMessageCount() view returns (uint256)',
  'function getInboxCount(uint256 tokenId) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

async function main() {
  const fromId = parseInt(process.argv[2]);
  const toId = parseInt(process.argv[3]);
  const message = process.argv[4];

  if (!fromId || !toId || !message) {
    console.error('Usage: PRIVATE_KEY=0x... node examples/send-message.js <fromId> <toId> "message"');
    process.exit(1);
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);

  const core = new ethers.Contract(ADDRESSES.core, CORE_ABI, wallet);

  // Verify sender owns the from token
  const owner = await core.ownerOf(fromId);
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`You don't own Exo #${fromId} (owner: ${owner})`);
    process.exit(1);
  }

  // Channel: general (bytes32 zero = default channel)
  const channel = ethers.ZeroHash;
  // Message type: 0 = text
  const msgType = 0;
  const payload = ethers.toUtf8Bytes(message);

  console.log(`Sending message from Exo #${fromId} to Exo #${toId}...`);
  console.log(`Message: "${message}"`);

  const tx = await core.sendMessage(fromId, toId, channel, msgType, payload);
  console.log(`TX: https://basescan.org/tx/${tx.hash}`);
  await tx.wait();

  const totalMessages = await core.getMessageCount();
  const inboxCount = await core.getInboxCount(toId);
  console.log(`Message sent. Total messages: ${totalMessages}, Exo #${toId} inbox: ${inboxCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
