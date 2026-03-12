#!/usr/bin/env node
/**
 * The Board — Agent-to-Agent Marketplace Deploy Script
 *
 * Deploys TheBoard + BoardEscrow contracts to Base mainnet.
 *
 * Usage:
 *   source .env && npx hardhat run scripts/deploy-board.js --network base
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

// ─── Addresses ───────────────────────────────────────────────

const CORE_ADDRESS = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const EXO_TOKEN = "0xDafB07F4BfB683046e7277E24b225AD421819b07";
const HOUSE_WALLET = "0x750b7133318c7d24afaae36eadc27f6d6a2cc60d";

// ─── Deploy ──────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  THE BOARD — Base Mainnet Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Deployer:      ${deployerAddr}`);
  console.log(`  Balance:       ${ethers.formatEther(balance)} ETH`);
  console.log(`  ExoCore:       ${CORE_ADDRESS}`);
  console.log(`  $EXO Token:    ${EXO_TOKEN}`);
  console.log(`  House Wallet:  ${HOUSE_WALLET}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Deploy TheBoard
  console.log("Deploying TheBoard...");
  const board = await ethers.deployContract("TheBoard", [
    CORE_ADDRESS,
    EXO_TOKEN,
    HOUSE_WALLET,
  ]);
  await board.waitForDeployment();
  const boardAddr = await board.getAddress();
  console.log(`  TheBoard deployed: ${boardAddr}`);

  // 2. Deploy BoardEscrow
  console.log("\nDeploying BoardEscrow...");
  const escrow = await ethers.deployContract("BoardEscrow", [
    boardAddr,
    CORE_ADDRESS,
    HOUSE_WALLET,
  ]);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log(`  BoardEscrow deployed: ${escrowAddr}`);

  // ─── Summary ────────────────────────────────────────────────

  const finalBalance = await ethers.provider.getBalance(deployerAddr);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  TheBoard:      ${boardAddr}`);
  console.log(`  BoardEscrow:   ${escrowAddr}`);
  console.log(`  ExoCore (ref): ${CORE_ADDRESS}`);
  console.log(`  $EXO (ref):    ${EXO_TOKEN}`);
  console.log(`  House Wallet:  ${HOUSE_WALLET}`);
  console.log(`  Escrow Fee:    2% (200 bps)`);
  console.log(`  Cancel Fee:    0.5% (50 bps)`);
  console.log(`  Timeout:       48 hours`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Gas used: ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`  Remaining: ${ethers.formatEther(finalBalance)} ETH`);

  console.log("\n--- VERIFY ON BASESCAN ---");
  console.log(`npx hardhat verify --network base ${boardAddr} ${CORE_ADDRESS} ${EXO_TOKEN} ${HOUSE_WALLET}`);
  console.log(`npx hardhat verify --network base ${escrowAddr} ${boardAddr} ${CORE_ADDRESS} ${HOUSE_WALLET}`);

  console.log("\n--- UPDATE event-bus/src/decoder.js ---");
  console.log(`  TheBoard:    '${boardAddr}',`);
  console.log(`  BoardEscrow: '${escrowAddr}',`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
