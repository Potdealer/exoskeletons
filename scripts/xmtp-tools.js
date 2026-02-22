#!/usr/bin/env node
/**
 * Exoskeletons — XMTP Tools
 *
 * CLI for XMTP messaging operations on Exoskeletons.
 * Each Exo's TBA is an XMTP identity via ERC-1271.
 *
 * Usage:
 *   node scripts/xmtp-tools.js status <tokenId>              — Pre-flight check
 *   node scripts/xmtp-tools.js init <tokenId>                 — Create/restore XMTP client
 *   node scripts/xmtp-tools.js send <tokenId> <to> <message>  — Send DM
 *   node scripts/xmtp-tools.js read <tokenId>                 — Read recent messages
 *   node scripts/xmtp-tools.js conversations <tokenId>        — List conversations
 *   node scripts/xmtp-tools.js can-message <tokenId> <addr>   — Check reachability
 *
 * Environment:
 *   PRIVATE_KEY    — Local signing key (deployment wallet Exos)
 *   BANKR_API_KEY  — Bankr API key (Bankr wallet Exos)
 *   XMTP_ENV       — "production" (default) or "dev"
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

import { validateExoForXMTP } from "../xmtp/signer.js";
import { createExoClient } from "../xmtp/client.js";
import { Exoskeleton } from "../exoskeleton.js";

const [,, command, ...args] = process.argv;

function usage() {
  console.log("Exoskeletons XMTP Tools\n");
  console.log("Usage:");
  console.log("  node scripts/xmtp-tools.js status <tokenId>                — Pre-flight check (no XMTP needed)");
  console.log("  node scripts/xmtp-tools.js init <tokenId>                  — Create/restore XMTP client");
  console.log("  node scripts/xmtp-tools.js send <tokenId> <to> <message>   — Send DM");
  console.log("  node scripts/xmtp-tools.js read <tokenId>                  — Read recent messages");
  console.log("  node scripts/xmtp-tools.js conversations <tokenId>         — List conversations");
  console.log("  node scripts/xmtp-tools.js can-message <tokenId> <addr>    — Check reachability");
  console.log("\nEnvironment:");
  console.log("  PRIVATE_KEY    — Local signing key (deployment wallet Exos)");
  console.log("  BANKR_API_KEY  — Bankr API key (Bankr wallet Exos)");
  console.log("  XMTP_ENV       — \"production\" (default) or \"dev\"");
  process.exit(0);
}

async function main() {
  if (!command) usage();

  const env = process.env.XMTP_ENV || "production";

  switch (command) {
    case "status": {
      const tokenId = parseInt(args[0]);
      if (!tokenId) { console.log("Usage: xmtp-tools.js status <tokenId>"); process.exit(1); }

      console.log(`\n=== XMTP STATUS — Exo #${tokenId} ===\n`);

      const exo = new Exoskeleton();
      const result = await validateExoForXMTP(tokenId);

      console.log(`  TBA Address: ${result.tbaAddress || "N/A"}`);
      console.log(`  XMTP Ready:  ${result.valid ? "YES" : "NO"}`);

      if (result.issues.length > 0) {
        console.log(`\n  Issues:`);
        for (const issue of result.issues) {
          console.log(`    - ${issue}`);
        }
      }

      // Show Exo owner for context
      try {
        const owner = await exo.getOwner(tokenId);
        console.log(`\n  Exo Owner:   ${owner}`);
      } catch { /* token may not exist */ }

      // Show signing config
      const hasKey = !!process.env.PRIVATE_KEY;
      const hasBankr = !!process.env.BANKR_API_KEY;
      console.log(`\n  Signing:`);
      console.log(`    PRIVATE_KEY:   ${hasKey ? "set" : "not set"}`);
      console.log(`    BANKR_API_KEY: ${hasBankr ? "set" : "not set"}`);
      console.log(`    XMTP_ENV:      ${env}`);
      break;
    }

    case "init": {
      const tokenId = parseInt(args[0]);
      if (!tokenId) { console.log("Usage: xmtp-tools.js init <tokenId>"); process.exit(1); }

      console.log(`\nInitializing XMTP for Exo #${tokenId} (${env})...`);

      const exoClient = await createExoClient(tokenId, { env });
      const status = exoClient.getStatus();

      console.log(`\n=== XMTP INITIALIZED — Exo #${tokenId} ===\n`);
      console.log(`  TBA Address:     ${status.tbaAddress}`);
      console.log(`  Inbox ID:        ${status.inboxId}`);
      console.log(`  Installation ID: ${status.installationId}`);
      console.log(`  Registered:      ${status.isRegistered}`);
      console.log(`  Environment:     ${status.env}`);
      break;
    }

    case "send": {
      const tokenId = parseInt(args[0]);
      const to = args[1];
      const message = args.slice(2).join(" ");
      if (!tokenId || !to || !message) {
        console.log("Usage: xmtp-tools.js send <tokenId> <to> <message>");
        process.exit(1);
      }

      console.log(`\nSending from Exo #${tokenId} to ${to}...`);

      const exoClient = await createExoClient(tokenId, { env });
      const msgId = await exoClient.sendMessage(to, message);

      console.log(`\n  Message sent!`);
      console.log(`  Message ID: ${msgId}`);
      console.log(`  To:         ${to}`);
      console.log(`  Text:       ${message}`);
      break;
    }

    case "read": {
      const tokenId = parseInt(args[0]);
      const limit = parseInt(args[1]) || 20;
      if (!tokenId) { console.log("Usage: xmtp-tools.js read <tokenId> [limit]"); process.exit(1); }

      console.log(`\nReading messages for Exo #${tokenId}...\n`);

      const exoClient = await createExoClient(tokenId, { env });
      const messages = await exoClient.readAllRecent(limit);

      if (messages.length === 0) {
        console.log("  No messages found.");
      } else {
        for (const msg of messages) {
          const time = msg.sentAt.toISOString();
          const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          console.log(`  [${time}] ${msg.senderInboxId.slice(0, 12)}...: ${content}`);
        }
        console.log(`\n  Total: ${messages.length} messages`);
      }
      break;
    }

    case "conversations": {
      const tokenId = parseInt(args[0]);
      if (!tokenId) { console.log("Usage: xmtp-tools.js conversations <tokenId>"); process.exit(1); }

      console.log(`\nConversations for Exo #${tokenId}...\n`);

      const exoClient = await createExoClient(tokenId, { env });
      const convos = await exoClient.listConversations();

      if (convos.length === 0) {
        console.log("  No conversations found.");
      } else {
        for (const convo of convos) {
          const created = convo.createdAt.toISOString();
          console.log(`  ${convo.id.slice(0, 16)}... — created ${created}`);
        }
        console.log(`\n  Total: ${convos.length} conversations`);
      }
      break;
    }

    case "can-message": {
      const tokenId = parseInt(args[0]);
      const addr = args[1];
      if (!tokenId || !addr) {
        console.log("Usage: xmtp-tools.js can-message <tokenId> <address>");
        process.exit(1);
      }

      console.log(`\nChecking XMTP reachability for ${addr}...`);

      const exoClient = await createExoClient(tokenId, { env });
      const canMsg = await exoClient.canMessage(addr);

      console.log(`\n  Address: ${addr}`);
      console.log(`  Can message: ${canMsg ? "YES" : "NO"}`);
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
