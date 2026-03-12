/**
 * Deploy ReputationOracle for Exoskeletons
 *
 * Usage:
 *   source .env && npx hardhat run scripts/deploy-oracle.js --network base
 *
 * Prerequisites:
 *   - PRIVATE_KEY in .env (deployment wallet)
 *   - Oracle will be deployed by the deployment wallet
 *   - After deployment, each Exo owner must call grantScorer(tokenId, oracleAddress)
 *     to allow the oracle to write composite scores
 */

import { network } from "hardhat";

const { ethers } = await network.connect();

// ─── Configuration ──────────────────────────────────────────
const EXOSKELETON_CORE = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const SCORE_KEY = ethers.keccak256(ethers.toUtf8Bytes("composite-reputation"));

// Initial sources to register after deployment
const INITIAL_SOURCES = [
  {
    address: "0x8F7403D5809Dd7245dF268ab9D596B3299A84B5C", // AgentOutlier
    name: "AgentOutlier",
    weight: 4000, // 40%
  },
  {
    address: "0x2574BD275d5ba939c28654745270C37554387ee5", // BoardEscrow
    name: "BoardEscrow",
    weight: 3000, // 30%
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ReputationOracle with account:", deployer.address);
  console.log("ExoskeletonCore:", EXOSKELETON_CORE);
  console.log("Score key:", SCORE_KEY);
  console.log("");

  // Deploy
  const oracle = await ethers.deployContract("ReputationOracle", [
    EXOSKELETON_CORE,
    SCORE_KEY,
  ]);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("ReputationOracle deployed to:", oracleAddress);

  // Register initial sources
  for (const source of INITIAL_SOURCES) {
    console.log(`\nAdding source: ${source.name} (${source.address}) weight=${source.weight}`);
    const tx = await oracle.addSource(source.address, source.name, source.weight);
    await tx.wait();
    console.log("  Done.");
  }

  console.log("\n--- Deployment Complete ---");
  console.log("Oracle address:", oracleAddress);
  console.log("Total weight:", (await oracle.totalWeight()).toString());
  console.log("Sources:", (await oracle.getSourceCount()).toString());
  console.log("");
  console.log("NEXT STEPS:");
  console.log("1. Grant oracle as scorer on each Exo you want tracked:");
  console.log(`   cast send ${EXOSKELETON_CORE} "grantScorer(uint256,address)" <TOKEN_ID> ${oracleAddress} --private-key $PRIVATE_KEY --rpc-url https://mainnet.base.org`);
  console.log("2. For Bankr wallet Exos, use Bankr API to call grantScorer");
  console.log("3. Sources (AgentOutlier, BoardEscrow) need to call reportScore() on the oracle");
  console.log("4. Anyone can then call recalculate(tokenId) to update composite scores");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
