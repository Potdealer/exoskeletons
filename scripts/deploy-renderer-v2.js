#!/usr/bin/env node
/**
 * ExoskeletonRendererV2 — Deploy + Hot-Swap
 *
 * Deploys V2 renderer with tier-gated CSS animations,
 * then calls core.setRenderer(v2) to activate it.
 *
 * V1 stays deployed at 0xE559f88f124AA2354B1570b85f6BE9536B6D60bC — one tx rollback.
 *
 * Usage:
 *   source .env && BASE_RPC_URL="$BASE_RPC_URL" PRIVATE_KEY="$PRIVATE_KEY" npx hardhat run scripts/deploy-renderer-v2.js --network base
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

const CORE_ADDRESS = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const V1_RENDERER = "0xE559f88f124AA2354B1570b85f6BE9536B6D60bC";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  EXOSKELETON RENDERER V2 — Deploy + Swap");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Deployer:     ${deployerAddr}`);
  console.log(`  Balance:      ${ethers.formatEther(balance)} ETH`);
  console.log(`  Core:         ${CORE_ADDRESS}`);
  console.log(`  V1 Renderer:  ${V1_RENDERER}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Deploy ExoskeletonRendererV2
  console.log("1/3 Deploying ExoskeletonRendererV2...");
  const renderer = await ethers.deployContract("ExoskeletonRendererV2", [
    CORE_ADDRESS,
  ]);
  await renderer.waitForDeployment();
  const v2Address = await renderer.getAddress();
  console.log(`     ExoskeletonRendererV2: ${v2Address}`);
  await delay(3000);

  // 2. Swap renderer on core
  console.log("2/3 Calling core.setRenderer(v2)...");
  const core = await ethers.getContractAt("ExoskeletonCore", CORE_ADDRESS);
  const tx = await core.setRenderer(v2Address);
  await tx.wait();
  console.log("     Renderer swapped to V2.");
  await delay(3000);

  // 3. Verify
  console.log("3/3 Verifying...");
  const currentRenderer = await core.renderer();
  console.log(`     Core renderer: ${currentRenderer}`);
  if (currentRenderer.toLowerCase() === v2Address.toLowerCase()) {
    console.log("     Verified: V2 is active.");
  } else {
    console.error("     ERROR: Renderer mismatch!");
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  V2 Renderer:  ${v2Address}`);
  console.log(`  V1 Renderer:  ${V1_RENDERER} (rollback target)`);
  console.log(`  Rollback:     core.setRenderer("${V1_RENDERER}")`);
  console.log("═══════════════════════════════════════════════════════");

  console.log("\n--- UPDATE THESE ---");
  console.log(`  renderer: "${v2Address}",`);

  const finalBalance = await ethers.provider.getBalance(deployerAddr);
  console.log(
    `\nGas used: ${ethers.formatEther(balance - finalBalance)} ETH`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
