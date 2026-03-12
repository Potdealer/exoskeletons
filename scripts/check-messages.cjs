#!/usr/bin/env node
/**
 * Check for new onchain Exoskeleton messages.
 * Polls ExoskeletonCore for messages since last check.
 * Optionally sends notifications via Telegram.
 *
 * Usage:
 *   node scripts/check-messages.js              # Check for new messages
 *   node scripts/check-messages.js --all         # Show all messages
 *   node scripts/check-messages.js --notify      # Send new messages to Telegram
 *   node scripts/check-messages.js --watch       # Poll every 5 minutes
 *   node scripts/check-messages.js --watch --notify  # Poll + notify
 *
 * Environment:
 *   BASE_RPC_URL (optional)
 *   TELEGRAM_BOT_TOKEN (optional, for --notify)
 *   TELEGRAM_CHAT_ID (optional, for --notify)
 */

try { require("dotenv").config(); } catch {}
const ethers = require("/mnt/e/Ai Agent/Projects/exoskeletons/node_modules/ethers/lib.commonjs/ethers.js");
const fs = require("fs");
const path = require("path");
const https = require("https");

const EXO_CORE = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const STATE_FILE = path.join(__dirname, "..", "data", "message-check-state.json");

const TELEGRAM_BOT_TOKEN = "8423436009:AAGdlkzGCa8RmDLPap-c6OyaymWAxNezuNQ";
const TELEGRAM_CHAT_ID = "6180484783";

const CORE_ABI = [
  "function getMessageCount() view returns (uint256)",
  "function messages(uint256 index) view returns (uint256 fromToken, uint256 toToken, bytes32 channel, uint8 msgType, bytes payload, uint256 timestamp)",
  "function getInboxCount(uint256 tokenId) view returns (uint256)",
];

const MSG_TYPES = ["text", "data", "request", "response", "handshake"];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastCheckedIndex: 0, lastRun: null };
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "HTML",
    });
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function checkMessages(opts = {}) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const core = new ethers.Contract(EXO_CORE, CORE_ABI, provider);

  const state = loadState();
  const showAll = opts.all;
  const notify = opts.notify;

  const totalCount = Number(await core.getMessageCount());
  const startIndex = showAll ? 0 : state.lastCheckedIndex;

  if (startIndex >= totalCount) {
    console.log(`No new messages. Total: ${totalCount}`);
    return [];
  }

  const newMessages = [];
  console.log(
    showAll
      ? `Showing all ${totalCount} messages:`
      : `${totalCount - startIndex} new message(s) (${startIndex} → ${totalCount}):`
  );
  console.log();

  for (let i = startIndex; i < totalCount; i++) {
    try {
      const msg = await core.messages(i);
      const time = new Date(Number(msg.timestamp) * 1000);
      let payload = "";
      try {
        payload = ethers.toUtf8String(msg.payload);
      } catch {
        payload = "[binary: " + msg.payload.slice(0, 40) + "...]";
      }

      const entry = {
        index: i,
        from: Number(msg.fromToken),
        to: Number(msg.toToken),
        channel:
          msg.channel === ethers.ZeroHash
            ? "direct"
            : msg.channel.slice(0, 10) + "...",
        type: MSG_TYPES[msg.msgType] || `type:${msg.msgType}`,
        payload: payload,
        timestamp: time.toISOString(),
      };

      newMessages.push(entry);

      const target =
        entry.to === 0
          ? "BROADCAST"
          : `→ #${entry.to}`;
      console.log(
        `[${i}] ${time.toLocaleString()} | #${entry.from} ${target} | ${entry.type}`
      );
      console.log(`     ${payload.slice(0, 200)}`);
      console.log();

      // Rate limit protection
      if (i < totalCount - 1) await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error(`[${i}] Error reading message: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Send Telegram notification for new messages
  if (notify && newMessages.length > 0 && !showAll) {
    let telegramMsg = `<b>EXO MESSAGES (${newMessages.length} new)</b>\n\n`;
    for (const m of newMessages) {
      const target = m.to === 0 ? "BROADCAST" : `→ #${m.to}`;
      telegramMsg += `<b>#${m.from} ${target}</b> (${m.type})\n`;
      telegramMsg += `${m.payload.slice(0, 150)}\n\n`;
    }
    try {
      await sendTelegram(telegramMsg);
      console.log("Telegram notification sent.");
    } catch (e) {
      console.error("Telegram send failed:", e.message);
    }
  }

  // Update state
  saveState({ lastCheckedIndex: totalCount, lastRun: new Date().toISOString() });

  return newMessages;
}

async function watch(opts) {
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  console.log("Watching for new exo messages every 5 minutes...");
  console.log("Press Ctrl+C to stop.\n");

  // Initial check
  await checkMessages(opts);

  setInterval(async () => {
    console.log(`\n--- Check at ${new Date().toLocaleString()} ---`);
    try {
      await checkMessages(opts);
    } catch (e) {
      console.error("Check failed:", e.message);
    }
  }, intervalMs);
}

// CLI
const args = process.argv.slice(2);
const opts = {
  all: args.includes("--all"),
  notify: args.includes("--notify"),
};

if (args.includes("--watch")) {
  watch(opts);
} else {
  checkMessages(opts).catch(console.error);
}
