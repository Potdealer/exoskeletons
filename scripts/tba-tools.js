#!/usr/bin/env node
/**
 * Exoskeletons — TBA (Token Bound Account) Tools
 *
 * CLI for reading TBA status and building TBA transactions.
 * Write operations output Bankr tx JSON. If BANKR_API_KEY is set,
 * optionally submits directly via Bankr API.
 *
 * Usage:
 *   node scripts/tba-tools.js status <tokenId>
 *   node scripts/tba-tools.js balance <tokenId> [erc20Address]
 *   node scripts/tba-tools.js activate <tokenId>
 *   node scripts/tba-tools.js send-eth <tokenId> <to> <amountETH>
 *   node scripts/tba-tools.js send-erc20 <tokenId> <tokenAddr> <to> <amount>
 *   node scripts/tba-tools.js transfer-nft <tokenId> <nftContract> <to> <nftId>
 *   node scripts/tba-tools.js call <tokenId> <target> <funcSig> [args...]
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

import { ethers } from "ethers";
import { Exoskeleton } from "../exoskeleton.js";

const exo = new Exoskeleton();

const [,, command, ...args] = process.argv;

function usage() {
  console.log("Exoskeletons TBA Tools\n");
  console.log("Usage:");
  console.log("  node scripts/tba-tools.js status <tokenId>                          — TBA info + balances");
  console.log("  node scripts/tba-tools.js balance <tokenId> [erc20]                 — ETH or token balance");
  console.log("  node scripts/tba-tools.js activate <tokenId>                        — Create TBA wallet");
  console.log("  node scripts/tba-tools.js send-eth <tokenId> <to> <amountETH>       — Send ETH from TBA");
  console.log("  node scripts/tba-tools.js send-erc20 <tokenId> <token> <to> <amount> — Send ERC-20 from TBA");
  console.log("  node scripts/tba-tools.js transfer-nft <tokenId> <nft> <to> <nftId> — Transfer NFT from TBA");
  console.log("  node scripts/tba-tools.js call <tokenId> <target> <funcSig> [args]  — Arbitrary contract call");
  process.exit(0);
}

async function submitToBankr(tx) {
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    console.log("\nBankr tx JSON (submit manually or set BANKR_API_KEY):");
    console.log(JSON.stringify(tx, null, 2));
    return;
  }

  console.log("\nSubmitting to Bankr...");
  try {
    const resp = await fetch("https://api.bankr.bot/agent/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ transaction: tx }),
    });
    const result = await resp.json();
    console.log("Bankr response:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Bankr submission failed:", e.message);
    console.log("\nFallback — tx JSON:");
    console.log(JSON.stringify(tx, null, 2));
  }
}

async function main() {
  if (!command) usage();

  switch (command) {
    case "status": {
      const tokenId = parseInt(args[0]);
      if (!tokenId) { console.log("Usage: tba-tools.js status <tokenId>"); process.exit(1); }

      console.log(`\n=== TBA STATUS — Exo #${tokenId} ===\n`);

      const status = await exo.getTBAStatus(tokenId);
      console.log(`  Activated:   ${status.activated}`);
      console.log(`  TBA Address: ${status.address}`);
      console.log(`  ETH Balance: ${ethers.formatEther(status.ethBalance)} ETH`);
      if (status.activated) {
        console.log(`  TBA Owner:   ${status.owner}`);
      }

      // Also show the Exo owner for context
      const exoOwner = await exo.getOwner(tokenId);
      console.log(`  Exo Owner:   ${exoOwner}`);

      if (status.activated) {
        const erc1271 = await exo.tbaSupportsERC1271(tokenId);
        const label = erc1271 === true ? "supported (XMTP ready)"
          : erc1271 === null ? "inconclusive (rate limited)"
          : "not detected";
        console.log(`  ERC-1271:    ${label}`);
      }
      break;
    }

    case "balance": {
      const tokenId = parseInt(args[0]);
      if (!tokenId) { console.log("Usage: tba-tools.js balance <tokenId> [erc20Address]"); process.exit(1); }

      const erc20 = args[1];
      if (erc20) {
        const bal = await exo.getTBATokenBalance(tokenId, erc20);
        console.log(`Exo #${tokenId} TBA token balance: ${bal}`);
      } else {
        const bal = await exo.getTBABalance(tokenId);
        console.log(`Exo #${tokenId} TBA ETH balance: ${ethers.formatEther(bal)} ETH`);
      }
      break;
    }

    case "activate": {
      const tokenId = parseInt(args[0]);
      if (!tokenId) { console.log("Usage: tba-tools.js activate <tokenId>"); process.exit(1); }

      const hasW = await exo.hasWallet(tokenId);
      if (hasW) {
        const addr = await exo.getWalletAddress(tokenId);
        console.log(`Exo #${tokenId} already has a TBA at ${addr}`);
        process.exit(0);
      }

      const tx = exo.buildActivateWallet(tokenId);
      console.log(`Activating TBA for Exo #${tokenId}...`);
      await submitToBankr(tx);
      break;
    }

    case "send-eth": {
      const tokenId = parseInt(args[0]);
      const to = args[1];
      const amount = args[2];
      if (!tokenId || !to || !amount) {
        console.log("Usage: tba-tools.js send-eth <tokenId> <to> <amountETH>");
        process.exit(1);
      }

      const tx = await exo.buildTBASendETH(tokenId, to, amount);
      console.log(`Send ${amount} ETH from Exo #${tokenId} TBA to ${to}`);
      await submitToBankr(tx);
      break;
    }

    case "send-erc20": {
      const tokenId = parseInt(args[0]);
      const tokenAddr = args[1];
      const to = args[2];
      const amount = args[3];
      if (!tokenId || !tokenAddr || !to || !amount) {
        console.log("Usage: tba-tools.js send-erc20 <tokenId> <tokenAddr> <to> <amount>");
        process.exit(1);
      }

      const tx = await exo.buildTBASendERC20(tokenId, tokenAddr, to, amount);
      console.log(`Send ${amount} of ${tokenAddr} from Exo #${tokenId} TBA to ${to}`);
      await submitToBankr(tx);
      break;
    }

    case "transfer-nft": {
      const tokenId = parseInt(args[0]);
      const nftContract = args[1];
      const to = args[2];
      const nftId = args[3];
      if (!tokenId || !nftContract || !to || !nftId) {
        console.log("Usage: tba-tools.js transfer-nft <tokenId> <nftContract> <to> <nftTokenId>");
        process.exit(1);
      }

      const tx = await exo.buildTBATransferNFT(tokenId, nftContract, to, nftId);
      console.log(`Transfer NFT #${nftId} from Exo #${tokenId} TBA to ${to}`);
      await submitToBankr(tx);
      break;
    }

    case "call": {
      const tokenId = parseInt(args[0]);
      const target = args[1];
      const funcSig = args[2];
      const callArgs = args.slice(3);
      if (!tokenId || !target || !funcSig) {
        console.log("Usage: tba-tools.js call <tokenId> <target> <funcSig> [args...]");
        console.log('Example: tba-tools.js call 1 0x1234... "approve(address,uint256)" 0xSpender 1000000');
        process.exit(1);
      }

      const tx = await exo.buildTBAContractCall(tokenId, target, funcSig, callArgs);
      console.log(`Call ${funcSig} on ${target} from Exo #${tokenId} TBA`);
      await submitToBankr(tx);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      usage();
  }
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
