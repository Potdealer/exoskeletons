/**
 * Exoskeletons — XMTP Client Wrapper
 *
 * Manages XMTP client lifecycle, encryption keys, and provides a clean
 * interface for messaging operations. Each Exoskeleton gets its own
 * XMTP identity through its TBA.
 *
 * Key management: xmtp/data/<tokenId>/encryption.key
 * DB persistence: xmtp/data/<tokenId>/xmtp.db3
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

import { Client } from "@xmtp/node-sdk";
import { createExoSignerFromEnv, createExoSigner, validateExoForXMTP } from "./signer.js";
import { Exoskeleton } from "../exoskeleton.js";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

/**
 * Get the data directory for a given token ID.
 * @param {number} tokenId
 * @returns {string}
 */
function getTokenDir(tokenId) {
  const dir = path.join(DATA_DIR, String(tokenId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Load or generate the 32-byte encryption key for a token.
 * Stored as hex in xmtp/data/<tokenId>/encryption.key
 *
 * @param {number} tokenId
 * @returns {Uint8Array} 32-byte key
 */
function loadOrCreateEncryptionKey(tokenId) {
  const dir = getTokenDir(tokenId);
  const keyPath = path.join(dir, "encryption.key");

  if (fs.existsSync(keyPath)) {
    const hex = fs.readFileSync(keyPath, "utf-8").trim();
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }

  // Generate new 32-byte key
  const key = randomBytes(32);
  fs.writeFileSync(keyPath, key.toString("hex"), "utf-8");
  return Uint8Array.from(key);
}

/**
 * Create an XMTP client for an Exoskeleton.
 *
 * @param {number} tokenId — Exoskeleton token ID
 * @param {object} [options]
 * @param {string} [options.env] — XMTP environment: "production" (default) or "dev"
 * @param {string} [options.privateKey] — Override private key
 * @param {string} [options.bankrApiKey] — Override Bankr API key
 * @param {object} [options._exoskeleton] — Injected Exoskeleton (testing)
 * @returns {Promise<ExoXMTPClient>}
 */
export async function createExoClient(tokenId, options = {}) {
  const env = options.env || "production";

  // Create signer
  const signerOpts = {};
  if (options._exoskeleton) signerOpts._exoskeleton = options._exoskeleton;
  if (options.privateKey) signerOpts.privateKey = options.privateKey;
  if (options.bankrApiKey) signerOpts.bankrApiKey = options.bankrApiKey;

  const signer = (options.privateKey || options.bankrApiKey)
    ? await createExoSigner(tokenId, signerOpts)
    : await createExoSignerFromEnv(tokenId, signerOpts);

  // Load encryption key and db path
  const encryptionKey = loadOrCreateEncryptionKey(tokenId);
  const dbPath = path.join(getTokenDir(tokenId), "xmtp.db3");

  // Create XMTP client
  const client = await Client.create(signer, {
    env,
    dbEncryptionKey: encryptionKey,
    dbPath,
  });

  return new ExoXMTPClient(client, tokenId, env);
}

/**
 * High-level wrapper around the XMTP Client for Exoskeleton operations.
 */
export class ExoXMTPClient {
  constructor(client, tokenId, env) {
    this.client = client;
    this.tokenId = tokenId;
    this.env = env;
  }

  /**
   * Send a text message to an address.
   * Creates a DM conversation if one doesn't exist.
   *
   * @param {string} recipientAddress — Ethereum address
   * @param {string} text — Message text
   * @returns {Promise<string>} Message ID
   */
  async sendMessage(recipientAddress, text) {
    const dm = await this.client.conversations.createDmWithIdentifier({
      identifier: recipientAddress.toLowerCase(),
      identifierKind: 1, // Ethereum
    });
    await dm.sync();
    return dm.sendText(text);
  }

  /**
   * List all conversations.
   *
   * @returns {Promise<Array>} Conversation list
   */
  async listConversations() {
    await this.client.conversations.sync();
    return this.client.conversations.list();
  }

  /**
   * Read recent messages across all conversations.
   *
   * @param {number} [limit=20] — Max messages per conversation
   * @returns {Promise<Array>} Messages sorted by time (newest first)
   */
  async readAllRecent(limit = 20) {
    await this.client.conversations.sync();
    const convos = await this.client.conversations.list();
    const allMessages = [];

    for (const convo of convos) {
      await convo.sync();
      const msgs = await convo.messages({ limit });
      for (const msg of msgs) {
        allMessages.push({
          conversationId: convo.id,
          id: msg.id,
          senderInboxId: msg.senderInboxId,
          content: msg.content,
          sentAt: msg.sentAt,
        });
      }
    }

    allMessages.sort((a, b) => b.sentAt - a.sentAt);
    return allMessages;
  }

  /**
   * Check if an address has XMTP.
   *
   * @param {string} address — Ethereum address
   * @returns {Promise<boolean>}
   */
  async canMessage(address) {
    const result = await this.client.canMessage([{
      identifier: address.toLowerCase(),
      identifierKind: 1, // Ethereum
    }]);
    // result is a Map
    for (const [, canMsg] of result) {
      return canMsg;
    }
    return false;
  }

  /**
   * Get client status info.
   *
   * @returns {object} Status info
   */
  getStatus() {
    const identifier = this.client.accountIdentifier;
    return {
      tokenId: this.tokenId,
      tbaAddress: identifier ? identifier.identifier : null,
      inboxId: this.client.inboxId,
      installationId: this.client.installationId,
      isRegistered: this.client.isRegistered,
      env: this.env,
    };
  }
}
