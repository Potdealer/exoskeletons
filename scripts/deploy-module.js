#!/usr/bin/env node
/**
 * Exoskeletons Module SDK — Deploy & Register Script
 *
 * Deploys a module contract and optionally submits it to the ModuleMarketplace.
 *
 * Usage:
 *   # Deploy StorageModule
 *   source .env && npx hardhat run scripts/deploy-module.js --network base
 *
 *   # Or with env vars inline
 *   BASE_RPC_URL="..." PRIVATE_KEY="..." npx hardhat run scripts/deploy-module.js --network base
 *
 * Configuration: Edit the MODULE CONFIG section below for your module.
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

// ─── DEPLOYED ADDRESSES ─────────────────────────────────────────

const CORE_ADDRESS = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const MARKETPLACE_ADDRESS = "0x0E760171da676c219F46f289901D0be1CBD06188";

// ─── MODULE CONFIG (edit this for your module) ──────────────────

const MODULE_CONFIG = {
  // The Solidity contract name (must match artifacts)
  contractName: "StorageModule",

  // Constructor args (after core address, which is auto-injected)
  // For StorageModule and ScoreModule: just [coreAddress]
  // For custom modules: add extra args here
  extraConstructorArgs: [],

  // Marketplace submission (set to null to skip marketplace registration)
  marketplace: {
    displayName: "Storage Vault",
    description: "Token-bound key-value storage with permissioned writers",
    version: "1.0.0",
    price: 0n, // 0 = free module
  },
};

// ─── DEPLOY ─────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  EXOSKELETON MODULE DEPLOYMENT");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Module:    ${MODULE_CONFIG.contractName}`);
  console.log(`  Deployer:  ${deployerAddr}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`  Core:      ${CORE_ADDRESS}`);
  if (MODULE_CONFIG.marketplace) {
    console.log(`  Marketplace: ${MARKETPLACE_ADDRESS}`);
  }
  console.log("═══════════════════════════════════════════════════════\n");

  // Deploy the module contract
  console.log(`Deploying ${MODULE_CONFIG.contractName}...`);
  const constructorArgs = [CORE_ADDRESS, ...MODULE_CONFIG.extraConstructorArgs];
  const moduleContract = await ethers.deployContract(
    MODULE_CONFIG.contractName,
    constructorArgs
  );
  await moduleContract.waitForDeployment();
  const moduleAddr = await moduleContract.getAddress();

  console.log(`  Deployed at: ${moduleAddr}`);

  // Verify it implements IExoModule
  const isExoModule = await moduleContract.isExoModule();
  const moduleName = await moduleContract.moduleName();
  const moduleKey = await moduleContract.moduleKey();
  const moduleVersion = await moduleContract.moduleVersion();

  console.log(`  isExoModule: ${isExoModule}`);
  console.log(`  Name:        ${moduleName}`);
  console.log(`  Version:     ${moduleVersion}`);
  console.log(`  Key:         ${moduleKey}`);

  // Submit to marketplace if configured
  if (MODULE_CONFIG.marketplace) {
    const mp = MODULE_CONFIG.marketplace;
    console.log("\n--- Marketplace Registration ---");

    const marketplace = await ethers.getContractAt("ModuleMarketplace", MARKETPLACE_ADDRESS);

    // Check if builder is registered
    const [, , , , registered] = await marketplace.getBuilder(deployerAddr);
    if (!registered) {
      console.log("  Registering as builder...");
      const regTx = await marketplace.registerBuilder("potdealer", "Exoskeleton module builder");
      await regTx.wait();
      console.log("  Builder registered.");
    }

    // Submit module
    console.log(`  Submitting "${mp.displayName}" to marketplace...`);
    const listingFee = ethers.parseEther("0.001");
    const submitTx = await marketplace.submitModule(
      moduleKey,
      mp.displayName,
      mp.description,
      mp.version,
      mp.price,
      { value: listingFee }
    );
    await submitTx.wait();
    console.log("  Module submitted (status: PENDING).");
    console.log("  Owner must call approveModule() to make it live.");
  }

  // Summary
  const finalBalance = await ethers.provider.getBalance(deployerAddr);
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Contract:   ${moduleAddr}`);
  console.log(`  Name:       ${moduleName}`);
  console.log(`  Key:        ${moduleKey}`);
  console.log(`  Gas used:   ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log(`  Balance:    ${ethers.formatEther(finalBalance)} ETH`);
  console.log("═══════════════════════════════════════════════════════");

  console.log("\n--- For verification ---");
  console.log(`npx hardhat verify --network base ${moduleAddr} ${constructorArgs.join(" ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
