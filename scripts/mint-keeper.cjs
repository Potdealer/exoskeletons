#!/usr/bin/env node
/**
 * ExoVending Keeper — watches for payments to the VendingMachine contract
 * and mints Exoskeletons to buyers.
 *
 * How it works:
 * 1. Someone sends exactly 0.005 ETH to the ExoVendingMachine contract via Bankr
 *    ("send 0.005 ETH to [VENDING_ADDRESS] on Base")
 * 2. Contract emits PaymentReceived(buyer, amount, timestamp)
 * 3. This script detects the event via WSS
 * 4. Calls ownerMint(randomConfig, buyerAddress) from the deployment wallet
 * 5. Exo gets minted directly to the buyer
 *
 * Works with ERC-4337 smart wallets (Bankr) because events fire regardless
 * of whether ETH arrives via direct transfer or internal call.
 *
 * Usage:
 *   node scripts/mint-keeper.cjs           # run keeper
 *   node scripts/mint-keeper.cjs --status  # check status
 *   node scripts/mint-keeper.cjs --withdraw # withdraw collected ETH
 *
 * Requires: PRIVATE_KEY in .env (deployment wallet = ExoskeletonCore owner)
 */

const { ethers } = require("ethers");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// --- CONFIG ---
const EXO_CORE = "0x8241BDD5009ed3F6C99737D2415994B58296Da0d";
const VENDING_MACHINE = "0xc6579259b45948b37D4D33A6D1407c206A2CCe80";
const WSS_URL = "wss://base-rpc.publicnode.com";
const HTTP_URL = "https://base-rpc.publicnode.com";
const TELEGRAM_BOT = "8423436009:AAGdlkzGCa8RmDLPap-c6OyaymWAxNezuNQ";
const TELEGRAM_CHAT = "6180484783";

const CORE_ABI = [
  "function ownerMint(bytes calldata config, address to) external",
  "function owner() view returns (address)",
  "function getMintPrice() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event ExoskeletonMinted(uint256 indexed tokenId, address indexed owner, bool genesis)",
];

const VENDING_ABI = [
  "event PaymentReceived(address indexed buyer, uint256 amount, uint256 timestamp)",
  "event Withdrawn(address indexed to, uint256 amount)",
  "function withdraw() external",
  "function owner() view returns (address)",
  "function MINT_PRICE() view returns (uint256)",
];

// --- HELPERS ---
async function sendTelegram(msg) {
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg, parse_mode: "Markdown" }),
      }
    );
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}

function randomConfig() {
  const seed = BigInt(ethers.randomBytes(32).reduce((acc, b, i) => acc + (BigInt(b) << BigInt(i * 8)), 0n));
  const config = new Uint8Array(9);
  config[0] = Number(seed % 6n);           // shape (0-5)
  config[1] = Number((seed >> 8n) & 0xFFn);  // R1
  config[2] = Number((seed >> 16n) & 0xFFn); // G1
  config[3] = Number((seed >> 24n) & 0xFFn); // B1
  config[4] = Number((seed >> 32n) & 0xFFn); // R2
  config[5] = Number((seed >> 40n) & 0xFFn); // G2
  config[6] = Number((seed >> 48n) & 0xFFn); // B2
  config[7] = Number((seed >> 56n) % 8n);    // symbol (0-7)
  config[8] = Number((seed >> 64n) % 6n);    // pattern (0-5)
  return ethers.hexlify(config);
}

// Track processed events to avoid double-minting
const processedEvents = new Set();

// RALPH escalation
let consecutiveFailures = 0;

async function handlePayment(buyer, amount, timestamp, txHash, core) {
  const key = `${txHash}-${buyer}`;
  if (processedEvents.has(key)) return;
  processedEvents.add(key);

  console.log(`\n[MINT] Payment detected!`);
  console.log(`  Buyer: ${buyer}`);
  console.log(`  Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`  TX: ${txHash}`);

  const config = randomConfig();
  console.log(`  Config: ${config}`);

  try {
    const tx = await core.ownerMint(config, buyer, {
      gasLimit: 300000,
    });
    console.log(`  Mint TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Confirmed in block ${receipt.blockNumber}`);

    // Find the minted tokenId from events
    let tokenId = "?";
    for (const log of receipt.logs) {
      try {
        const parsed = core.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "ExoskeletonMinted") {
          tokenId = parsed.args[0].toString();
        }
      } catch {}
    }

    consecutiveFailures = 0;
    await sendTelegram(
      `*ExoVending Mint!*\n` +
      `Buyer: \`${buyer}\`\n` +
      `Exo #${tokenId}\n` +
      `Config: \`${config}\`\n` +
      `[TX](https://basescan.org/tx/${tx.hash})`
    );
    console.log(`  SUCCESS — Exo #${tokenId} minted to ${buyer}`);
  } catch (e) {
    consecutiveFailures++;
    console.error(`  MINT FAILED: ${e.message}`);
    await sendTelegram(
      `*ExoVending Mint Failed*\n` +
      `Buyer: \`${buyer}\`\n` +
      `Error: ${e.message.slice(0, 200)}\n` +
      `Failures: ${consecutiveFailures}`
    );

    // RALPH: 3+ failures = stop
    if (consecutiveFailures >= 3) {
      await sendTelegram(`*ExoVending STOPPED* — 3 consecutive failures. Check logs.`);
      console.error("RALPH: 3 consecutive failures. Exiting.");
      process.exit(1);
    }
  }
}

// --- MAIN ---
async function startKeeper() {
  console.log("=== ExoVending Keeper ===");
  console.log(`VendingMachine: ${VENDING_MACHINE}`);
  console.log(`ExoskeletonCore: ${EXO_CORE}`);
  console.log();

  const httpProvider = new ethers.JsonRpcProvider(HTTP_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, httpProvider);
  const core = new ethers.Contract(EXO_CORE, CORE_ABI, wallet);

  // Verify we're the owner
  const owner = await core.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`ERROR: Wallet ${wallet.address} is not the owner (${owner})`);
    process.exit(1);
  }
  console.log(`Owner verified: ${wallet.address}`);

  const balance = await httpProvider.getBalance(wallet.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);

  const vendingBalance = await httpProvider.getBalance(VENDING_MACHINE);
  console.log(`Vending balance: ${ethers.formatEther(vendingBalance)} ETH`);

  const supply = await core.totalSupply();
  console.log(`Exo supply: ${supply.toString()}`);
  console.log();

  // WSS connection with RALPH reconnect
  let reconnectAttempts = 0;

  function connect() {
    console.log("[WSS] Connecting...");
    const wsProvider = new ethers.WebSocketProvider(WSS_URL);

    const vendingWs = new ethers.Contract(VENDING_MACHINE, VENDING_ABI, wsProvider);

    // Listen for PaymentReceived events
    vendingWs.on("PaymentReceived", async (buyer, amount, timestamp, event) => {
      const txHash = event.log.transactionHash;
      console.log(`[EVENT] PaymentReceived from ${buyer} — ${ethers.formatEther(amount)} ETH`);
      await handlePayment(buyer, amount, timestamp, txHash, core);
    });

    wsProvider.websocket.on("open", () => {
      console.log("[WSS] Connected. Listening for PaymentReceived events...");
      reconnectAttempts = 0;
    });

    wsProvider.websocket.on("close", () => {
      console.log("[WSS] Disconnected. Reconnecting...");
      reconnectAttempts++;
      if (reconnectAttempts > 10) {
        sendTelegram("*ExoVending WSS* — 10 reconnect failures. Check keeper.");
        process.exit(1);
      }
      setTimeout(connect, Math.min(reconnectAttempts * 2000, 30000));
    });

    wsProvider.websocket.on("error", (err) => {
      console.error("[WSS] Error:", err.message);
    });
  }

  connect();
  await sendTelegram(
    `*ExoVending Keeper started*\n` +
    `Vending: \`${VENDING_MACHINE}\`\n` +
    `Send 0.005 ETH to mint an Exoskeleton.`
  );
}

async function showStatus() {
  const httpProvider = new ethers.JsonRpcProvider(HTTP_URL);
  const core = new ethers.Contract(EXO_CORE, CORE_ABI, httpProvider);
  const vending = new ethers.Contract(VENDING_MACHINE, VENDING_ABI, httpProvider);

  const [owner, price, supply, vendingOwner, mintPrice] = await Promise.all([
    core.owner(),
    core.getMintPrice(),
    core.totalSupply(),
    vending.owner(),
    vending.MINT_PRICE(),
  ]);

  const deployerBalance = await httpProvider.getBalance(owner);
  const vendingBalance = await httpProvider.getBalance(VENDING_MACHINE);

  console.log("=== ExoVending Status ===");
  console.log(`VendingMachine: ${VENDING_MACHINE}`);
  console.log(`Vending balance: ${ethers.formatEther(vendingBalance)} ETH`);
  console.log(`Vending owner: ${vendingOwner}`);
  console.log(`Mint price: ${ethers.formatEther(mintPrice)} ETH`);
  console.log();
  console.log(`ExoskeletonCore: ${EXO_CORE}`);
  console.log(`Core owner: ${owner}`);
  console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`);
  console.log(`Total supply: ${supply.toString()}`);
}

async function withdrawFunds() {
  const httpProvider = new ethers.JsonRpcProvider(HTTP_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, httpProvider);
  const vending = new ethers.Contract(VENDING_MACHINE, VENDING_ABI, wallet);

  const balance = await httpProvider.getBalance(VENDING_MACHINE);
  if (balance === 0n) {
    console.log("Nothing to withdraw.");
    return;
  }

  console.log(`Withdrawing ${ethers.formatEther(balance)} ETH...`);
  const tx = await vending.withdraw();
  await tx.wait();
  console.log(`Withdrawn. TX: ${tx.hash}`);
}

// --- ENTRY ---
if (process.argv.includes("--status")) {
  showStatus().catch(console.error);
} else if (process.argv.includes("--withdraw")) {
  withdrawFunds().catch(console.error);
} else {
  startKeeper().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
