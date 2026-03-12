#!/usr/bin/env node
/**
 * ExoskeletonRendererV3 — Deploy + Hot-Swap
 *
 * Deploys V3 renderer with reputation-driven visual evolution,
 * then calls core.setRenderer(v3) to activate it.
 *
 * V2 stays deployed at its address — one tx rollback.
 *
 * Usage:
 *   source .env && BASE_RPC_URL="$BASE_RPC_URL" PRIVATE_KEY="$PRIVATE_KEY" npx hardhat run scripts/deploy-renderer-v3.js --network base
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

const CORE_ADDRESS = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const V2_RENDERER = "0xf000dF16982EAc46f1168ea2C9DE820BCbC5287d";
const V1_RENDERER = "0xE559f88f124AA2354B1570b85f6BE9536B6D60bC";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  EXOSKELETON RENDERER V3 — Deploy + Swap");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Deployer:     ${deployerAddr}`);
  console.log(`  Balance:      ${ethers.formatEther(balance)} ETH`);
  console.log(`  Core:         ${CORE_ADDRESS}`);
  console.log(`  V2 Renderer:  ${V2_RENDERER}`);
  console.log(`  V1 Renderer:  ${V1_RENDERER}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Deploy ExoskeletonRendererV3
  console.log("1/3 Deploying ExoskeletonRendererV3...");
  const renderer = await ethers.deployContract("ExoskeletonRendererV3", [
    CORE_ADDRESS,
  ]);
  await renderer.waitForDeployment();
  const v3Address = await renderer.getAddress();
  console.log(`     ExoskeletonRendererV3: ${v3Address}`);
  await delay(3000);

  // 2. Swap renderer on core
  console.log("2/3 Calling core.setRenderer(v3)...");
  const core = await ethers.getContractAt("ExoskeletonCore", CORE_ADDRESS);
  const tx = await core.setRenderer(v3Address);
  await tx.wait();
  console.log("     Renderer swapped to V3.");
  await delay(3000);

  // 3. Verify
  console.log("3/3 Verifying...");
  const currentRenderer = await core.renderer();
  console.log(`     Core renderer: ${currentRenderer}`);
  if (currentRenderer.toLowerCase() === v3Address.toLowerCase()) {
    console.log("     Verified: V3 is active.");
  } else {
    console.error("     ERROR: Renderer mismatch!");
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  V3 Renderer:  ${v3Address}`);
  console.log(`  V2 Renderer:  ${V2_RENDERER} (rollback target)`);
  console.log(`  V1 Renderer:  ${V1_RENDERER} (original)`);
  console.log(`  Rollback V2:  core.setRenderer("${V2_RENDERER}")`);
  console.log(`  Rollback V1:  core.setRenderer("${V1_RENDERER}")`);
  console.log("═══════════════════════════════════════════════════════");

  console.log("\n--- UPDATE THESE ---");
  console.log(`  renderer: "${v3Address}",`);

  const finalBalance = await ethers.provider.getBalance(deployerAddr);
  console.log(
    `\nGas used: ${ethers.formatEther(balance - finalBalance)} ETH`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
