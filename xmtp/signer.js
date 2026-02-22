/**
 * Exoskeletons — XMTP SCW Signer Factory
 *
 * Creates XMTP-compatible Smart Contract Wallet signers for Exoskeletons.
 * Each Exo's ERC-6551 TBA supports ERC-1271 signature validation, making
 * it a valid XMTP messaging identity.
 *
 * Two signing modes:
 *   - Local key: Signs with a private key (deployment wallet Exos)
 *   - Bankr API: Signs via POST /agent/sign (Bankr wallet Exos)
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

import { ethers } from "ethers";
import { IdentifierKind } from "@xmtp/node-sdk";
import { Exoskeleton } from "../exoskeleton.js";

/**
 * Create an XMTP-compatible SCW signer for an Exoskeleton.
 *
 * @param {number} tokenId — Exoskeleton token ID
 * @param {object} options
 * @param {string} [options.privateKey] — Local signing key (deployment wallet)
 * @param {string} [options.bankrApiKey] — Bankr API key (Bankr wallet)
 * @param {object} [options._exoskeleton] — Injected Exoskeleton instance (testing)
 * @returns {Promise<object>} XMTP SCW signer
 */
export async function createExoSigner(tokenId, options = {}) {
  const { privateKey, bankrApiKey, _exoskeleton } = options;
  const exo = _exoskeleton || new Exoskeleton();

  if (!privateKey && !bankrApiKey) {
    throw new Error("createExoSigner requires either privateKey or bankrApiKey");
  }

  // Get TBA address
  const tbaAddress = await exo.getWalletAddress(tokenId);

  // Verify TBA is activated
  const hasW = await exo.hasWallet(tokenId);
  if (!hasW) {
    throw new Error(`Exo #${tokenId} TBA is not activated. Run: node scripts/tba-tools.js activate ${tokenId}`);
  }

  // Build the signer
  const localWallet = privateKey ? new ethers.Wallet(privateKey) : null;

  return {
    type: "SCW",

    getIdentifier() {
      return {
        identifier: tbaAddress.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      };
    },

    async signMessage(message) {
      let signature;

      if (localWallet) {
        // Local key signing — EIP-191 personal_sign
        const sig = await localWallet.signMessage(message);
        signature = sig;
      } else {
        // Bankr API signing
        const resp = await fetch("https://api.bankr.bot/agent/sign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": bankrApiKey,
          },
          body: JSON.stringify({
            signatureType: "personal_sign",
            message,
          }),
        });
        const result = await resp.json();
        if (!result.success && !result.signature) {
          throw new Error(`Bankr sign failed: ${JSON.stringify(result)}`);
        }
        signature = result.signature;
      }

      // Convert hex signature to Uint8Array
      return ethers.getBytes(signature);
    },

    getChainId() {
      return 8453n; // Base mainnet
    },
  };
}

/**
 * Create a signer from environment variables.
 * Checks PRIVATE_KEY first, then BANKR_API_KEY.
 *
 * @param {number} tokenId — Exoskeleton token ID
 * @param {object} [options] — Additional options (e.g. _exoskeleton for testing)
 * @returns {Promise<object>} XMTP SCW signer
 */
export async function createExoSignerFromEnv(tokenId, options = {}) {
  const privateKey = process.env.PRIVATE_KEY;
  const bankrApiKey = process.env.BANKR_API_KEY;

  if (!privateKey && !bankrApiKey) {
    throw new Error("Set PRIVATE_KEY or BANKR_API_KEY in environment");
  }

  return createExoSigner(tokenId, {
    privateKey: privateKey || undefined,
    bankrApiKey: !privateKey ? bankrApiKey : undefined,
    ...options,
  });
}

/**
 * Pre-flight validation: check if an Exo is ready for XMTP.
 *
 * @param {number} tokenId — Exoskeleton token ID
 * @param {object} [options]
 * @param {object} [options._exoskeleton] — Injected Exoskeleton instance (testing)
 * @returns {Promise<object>} { valid, tbaAddress, issues[] }
 */
export async function validateExoForXMTP(tokenId, options = {}) {
  const exo = options._exoskeleton || new Exoskeleton();
  const issues = [];

  let tbaAddress;
  try {
    tbaAddress = await exo.getWalletAddress(tokenId);
  } catch (e) {
    issues.push(`Failed to get TBA address: ${e.message}`);
    return { valid: false, tbaAddress: null, issues };
  }

  const hasW = await exo.hasWallet(tokenId);
  if (!hasW) {
    issues.push("TBA not activated");
  }

  if (hasW) {
    const erc1271 = await exo.tbaSupportsERC1271(tokenId);
    if (erc1271 === false) {
      issues.push("ERC-1271 not supported on TBA");
    } else if (erc1271 === null) {
      issues.push("ERC-1271 check inconclusive (rate limited)");
    }
  }

  return {
    valid: issues.length === 0,
    tbaAddress,
    issues,
  };
}
