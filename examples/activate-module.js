/**
 * Browse marketplace and activate a module — example script.
 *
 * Usage: PRIVATE_KEY=0x... node examples/activate-module.js <tokenId> <moduleName>
 *
 * Example: PRIVATE_KEY=0x... node examples/activate-module.js 1 storage-vault
 */

import { ethers } from 'ethers';
import { ADDRESSES, moduleKey, MarketplaceABI, IExoModuleABI } from '../sdk/index.js';

const RPC = 'https://base-rpc.publicnode.com';

async function main() {
  const tokenId = parseInt(process.argv[2]);
  const moduleName = process.argv[3];

  if (!tokenId || !moduleName) {
    console.error('Usage: PRIVATE_KEY=0x... node examples/activate-module.js <tokenId> <moduleName>');
    console.error('Example: PRIVATE_KEY=0x... node examples/activate-module.js 1 storage-vault');
    process.exit(1);
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Wallet: ${wallet.address}`);

  const marketplace = new ethers.Contract(ADDRESSES.marketplace, MarketplaceABI, wallet);

  // Look up module
  const key = moduleKey(moduleName);
  console.log(`Module key: ${key}`);

  const info = await marketplace.getModule(key);
  console.log(`\n--- Module: ${info[1]} ---`);
  console.log(`Builder:     ${info[0]}`);
  console.log(`Description: ${info[2]}`);
  console.log(`Version:     ${info[3]}`);
  console.log(`Price:       ${ethers.formatEther(info[4])} ETH`);
  console.log(`Status:      ${['Pending', 'Approved', 'Rejected'][Number(info[5])]}`);
  console.log(`Activations: ${info[8]}`);

  if (Number(info[5]) !== 1) {
    console.error('Module is not approved');
    process.exit(1);
  }

  // Check if already active
  const isActive = await marketplace.isModuleActive(tokenId, key);
  if (isActive) {
    console.log(`\nModule already active on Exo #${tokenId}`);
    return;
  }

  // Activate on marketplace
  console.log(`\nActivating ${moduleName} on Exo #${tokenId}...`);
  const tx = await marketplace.activateModule(tokenId, key, { value: info[4] });
  console.log(`TX: https://basescan.org/tx/${tx.hash}`);
  await tx.wait();
  console.log('Module activated on marketplace.');

  // Call onActivate on the module contract itself
  const moduleContract = new ethers.Contract(info[0], IExoModuleABI, wallet);
  try {
    const tx2 = await moduleContract.onActivate(tokenId);
    console.log(`Module onActivate TX: https://basescan.org/tx/${tx2.hash}`);
    await tx2.wait();
    console.log('Module initialization complete.');
  } catch (e) {
    console.log('Note: onActivate call skipped or not needed:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
