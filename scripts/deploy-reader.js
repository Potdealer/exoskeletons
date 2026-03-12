#!/usr/bin/env node
/**
 * ExoReader — Deploy Script
 *
 * Deploys the read-only multicall contract for Exoskeleton terminal UIs.
 *
 * Usage:
 *   source .env && npx hardhat run scripts/deploy-reader.js --network base
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

// ─── Deployed Addresses (Base Mainnet) ──────────────────────

const CORE_ADDRESS = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const WALLET_ADDRESS = "0x78aF4B6D78a116dEDB3612A30365718B076894b9";
const REGISTRY_ADDRESS = "0x46fd56417dcd08cA8de1E12dd6e7f7E1b791B3E9";
const MARKETPLACE_ADDRESS = "0x0E760171da676c219F46f289901D0be1CBD06188";
const MEMORY_MODULE_ADDRESS = "0x9F38406bc747C7aF4F85d17c0DD44F5d149e56d3";
const BOARD_ADDRESS = "0x27a62eD97C9CC0ce71AC20bdb6E002c0ca040213";

// ─── Deploy ─────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  EXO READER — Base Mainnet Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Deployer:           ${deployerAddr}`);
  console.log(`  Balance:            ${ethers.formatEther(balance)} ETH`);
  console.log(`  ExoCore:            ${CORE_ADDRESS}`);
  console.log(`  ExoWallet:          ${WALLET_ADDRESS}`);
  console.log(`  Registry:           ${REGISTRY_ADDRESS}`);
  console.log(`  Marketplace:        ${MARKETPLACE_ADDRESS}`);
  console.log(`  EncryptedMemory:    ${MEMORY_MODULE_ADDRESS}`);
  console.log(`  TheBoard:           ${BOARD_ADDRESS}`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("Deploying ExoReader...");
  const reader = await ethers.deployContract("ExoReader", [
    CORE_ADDRESS,
    WALLET_ADDRESS,
    REGISTRY_ADDRESS,
    MARKETPLACE_ADDRESS,
    MEMORY_MODULE_ADDRESS,
    BOARD_ADDRESS,
  ]);
  await reader.waitForDeployment();
  const readerAddr = await reader.getAddress();
  console.log(`  ExoReader deployed: ${readerAddr}`);

  // ─── Summary ──────────────────────────────────────────────

  const finalBalance = await ethers.provider.getBalance(deployerAddr);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ExoReader:          ${readerAddr}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Gas used: ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`  Remaining: ${ethers.formatEther(finalBalance)} ETH`);

  console.log("\n--- VERIFY ON BASESCAN ---");
  console.log(`npx hardhat verify --network base ${readerAddr} ${CORE_ADDRESS} ${WALLET_ADDRESS} ${REGISTRY_ADDRESS} ${MARKETPLACE_ADDRESS} ${MEMORY_MODULE_ADDRESS} ${BOARD_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
