#!/usr/bin/env node
/**
 * EncryptedMemoryModule — Deploy + Marketplace Submit
 *
 * Deploys the EncryptedMemoryModule to Base mainnet and submits it
 * to the ModuleMarketplace.
 *
 * Usage:
 *   source .env && npx hardhat run scripts/deploy-memory.js --network base
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

// ─── Addresses ───────────────────────────────────────────────

const CORE_ADDRESS = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const MARKETPLACE_ADDRESS = "0x0E760171da676c219F46f289901D0be1CBD06188";

// ─── Deploy ──────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ENCRYPTED MEMORY MODULE — Base Mainnet Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Deployer:      ${deployerAddr}`);
  console.log(`  Balance:       ${ethers.formatEther(balance)} ETH`);
  console.log(`  ExoCore:       ${CORE_ADDRESS}`);
  console.log(`  Marketplace:   ${MARKETPLACE_ADDRESS}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Deploy EncryptedMemoryModule
  console.log("Deploying EncryptedMemoryModule...");
  const memory = await ethers.deployContract("EncryptedMemoryModule", [CORE_ADDRESS]);
  await memory.waitForDeployment();
  const memoryAddr = await memory.getAddress();
  console.log(`  EncryptedMemoryModule deployed: ${memoryAddr}`);

  // 2. Submit to ModuleMarketplace
  console.log("\nSubmitting to ModuleMarketplace...");
  const marketplace = await ethers.getContractAt("ModuleMarketplace", MARKETPLACE_ADDRESS);
  const tx = await marketplace.submitModule(memoryAddr, 0); // 0 = free
  await tx.wait();
  console.log("  Submitted to marketplace (pending approval)");

  // ─── Summary ────────────────────────────────────────────────

  const finalBalance = await ethers.provider.getBalance(deployerAddr);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  EncryptedMemoryModule: ${memoryAddr}`);
  console.log(`  ExoCore (ref):         ${CORE_ADDRESS}`);
  console.log(`  Marketplace (ref):     ${MARKETPLACE_ADDRESS}`);
  console.log(`  Price:                 FREE`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Gas used: ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`  Remaining: ${ethers.formatEther(finalBalance)} ETH`);

  console.log("\n--- VERIFY ON BASESCAN ---");
  console.log(`npx hardhat verify --network base ${memoryAddr} ${CORE_ADDRESS}`);

  console.log("\n--- NEXT STEPS ---");
  console.log("1. Approve module on marketplace (owner)");
  console.log("2. Activate on Exo #1");
  console.log("3. Grant writer to Exo #1 TBA (0xa392...)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
