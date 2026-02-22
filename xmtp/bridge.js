/**
 * Exoskeletons — XMTP ↔ Onchain Bridge (Phase 2 Stub)
 *
 * Future relay between XMTP encrypted messaging and Exoskeleton
 * onchain communication (ExoskeletonCore.sendMessage).
 *
 * Phase 2 — not yet implemented.
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

/**
 * Relay an XMTP message to ExoskeletonCore.sendMessage onchain.
 *
 * @param {ExoXMTPClient} exoClient — Initialized XMTP client
 * @param {number} fromTokenId — Sender Exo token ID
 * @param {number} toTokenId — Recipient Exo token ID
 * @param {string} message — Message text
 */
export function relayXMTPToOnchain(exoClient, fromTokenId, toTokenId, message) {
  throw new Error("Phase 2 — not yet implemented");
}

/**
 * Relay an onchain ExoskeletonCore message to XMTP.
 *
 * @param {ExoXMTPClient} exoClient — Initialized XMTP client
 * @param {number} messageIndex — Onchain message index
 */
export function relayOnchainToXMTP(exoClient, messageIndex) {
  throw new Error("Phase 2 — not yet implemented");
}

/**
 * Start a bidirectional bridge for an Exoskeleton.
 * Watches both XMTP and onchain for new messages and relays.
 *
 * @param {number} tokenId — Exoskeleton token ID
 * @param {object} [options] — Bridge options
 */
export function startBridge(tokenId, options = {}) {
  throw new Error("Phase 2 — not yet implemented");
}
