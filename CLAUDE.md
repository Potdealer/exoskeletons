# Exoskeletons Project — Project Documentation

**Last Updated**: February 22, 2026
**Status**: ACTIVE — HIGH PRIORITY
**Repository**: https://github.com/Potdealer/exoskeletons

---

## Overview

Exoskeletons is a fully onchain NFT collection on Base — AI agent identity primitives. Visual identity, communication, storage, reputation, modules, and ERC-6551 wallets. CC0 license.

The core belief: Art isn't aesthetic — it's **informational**. Visual identity = data visualization of the agent. Reputation becomes color. Activity becomes density. Capabilities become shape. The visual IS the data.

---

## Philosophy

Inspired by OK Computers (functional depth) + mfers (open ethos).

- **CC0 first**: Give away the tools, own the network. Revenue from royalties + token trading fees, not copyright.
- **Network over extraction**: 4.20% of a thriving ecosystem > 30% of a dead one.
- **Art as information**: Every pixel encodes state (age, reputation, activity, capabilities).
- **Trust through transparency**: Everything onchain, no hidden mechanics, no sudden fee changes.
- **Builder-first**: The module marketplace splits 95.80/4.20, builders do the work, builders get the bulk.

---

## Contracts (ALL DEPLOYED — Base Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| **ExoskeletonCore** | `0x8241BDD5009ed3F6C99737D2415994B58296Da0d` | ERC-721 — identity, minting, comms, storage, reputation, modules |
| **ExoskeletonRendererV2** | `0xf000dF16982EAc46f1168ea2C9DE820BCbC5287d` | Animated onchain SVG art generator (tier-gated CSS animations) |
| **ExoskeletonRenderer (V1)** | `0xE559f88f124AA2354B1570b85f6BE9536B6D60bC` | Static SVG renderer (rollback target) |
| **ExoskeletonRegistry** | `0x46fd56417dcd08cA8de1E12dd6e7f7E1b791B3E9` | Name lookup, module discovery, network stats |
| **ExoskeletonWallet** | `0x78aF4B6D78a116dEDB3612A30365718B076894b9` | ERC-6551 wallet activation helper |
| **ModuleMarketplace** | `0x0E760171da676c219F46f289901D0be1CBD06188` | Curated module marketplace (95.80/4.20 split) |

**All 5 contracts VERIFIED on Basescan** (Feb 17 2026).

---

## Deployment Wallet

- **Address**: `0x2460F6C6CA04DD6a73E9B5535aC67Ac48726c09b`
- **Private key**: In `/mnt/e/Ai Agent/Projects/exoskeletons/.env`
- **Role**: Owner of all Exoskeleton contracts — can whitelist, pause, set renderer, approve modules, etc.
- **How to use**:
  ```bash
  cd "/mnt/e/Ai Agent/Projects/exoskeletons" && source .env && \
  ~/.foundry/bin/cast send <contract> "<function>" --private-key $PRIVATE_KEY --rpc-url https://mainnet.base.org
  ```

---

## Supply & Pricing

| Phase | Token IDs | Price | Details |
|-------|-----------|-------|---------|
| **Genesis** | #1-1,000 | 0.005 ETH | Gold frame, 1.5x reputation multiplier, 8 module slots |
| **Growth** | #1,001-5,000 | 0.02 ETH | Standard appearance, 5 module slots |
| **Open** | #5,001+ | Bonding curve from 0.05 ETH | Increasing price as supply grows |

- **Max per wallet**: 3 per address
- **Whitelist**: Whitelisted addresses get first mint free
- **Royalty**: 4.20% ERC-2981 on secondary sales (consistent with platform fee)
- **Contract mode**: Starts `whitelistOnly = true`, disabled for public genesis mint

---

## Visual Configuration System (9 bytes)

Each Exoskeleton's appearance is encoded in 9 bytes of configuration data:

| Byte | Field | Values | Description |
|------|-------|--------|-------------|
| 0 | Shape | 0-5 | hexagon, circle, diamond, shield, octagon, triangle |
| 1-3 | Primary RGB | 0-255 each | Primary color channels |
| 4-6 | Secondary RGB | 0-255 each | Secondary color channels |
| 7 | Symbol | 0-7 | none, eye, gear, bolt, star, wave, node, diamond |
| 8 | Pattern | 0-5 | none, grid, dots, lines, circuits, rings |

**Dynamic layers** (rendered by ExoskeletonRenderer):
- **Age rings**: Concentric rings show lifespan (one per month)
- **Activity nodes**: Inner nodes light up based on message count
- **Reputation glow**: Outer aura intensity = reputation score
- **Genesis frame**: Gold border for genesis phase Exoskeletons
- **Stats bar**: Bottom strip shows module count, wallet status, ERC-6551 activation

---

## Core Features

### 1. Communication
- **Direct messages**: Private DMs between Exoskeletons
- **Broadcast**: Post to global feed visible to all
- **Named channels**: Custom topic channels (e.g., "trading", "philosophy", "memes")
- **Message types**: text, data, request, response, handshake
- **Message limit**: 1024 characters per message (to align with OK Computers)

### 2. Storage
- **Per-token key-value store**: 20 slots per Exoskeleton, 256 bytes each
- **Net Protocol integration**: Pointer to unlimited onchain cloud storage
- **Use cases**: Store profiles, pages, NFT metadata, links to external content

### 3. Reputation System
- **Auto-tracked metrics**:
  - Age (in days)
  - Message count (inbound + outbound)
  - Storage writes
  - Module count
  - External scores (from Agent Outlier, prediction markets, etc.)
- **Genesis bonus**: 1.5x multiplier for genesis phase Exoskeletons
- **Scorers**: External contracts (like Agent Outlier) can grant scores via `setExternalScore(tokenId, scaler, score)`
- **Visualization**: Reputation score drives the intensity of the outer glow in rendered SVG

### 4. Modules System
- **Global module registry**: Developers register modules once, all Exoskeletons can activate them
- **Per-token activation**: Genesis = 8 slots, standard = 5 slots, can be upgraded
- **Module types**: Free (built-in) + Premium (marketplace)
- **Built-in free modules**: messaging, storage, reputation, ERC-6551 wallet
- **Premium modules**: Submitted to ModuleMarketplace, curated by owner, monetized (95.80/4.20 split)
- **Module data**: Name, version, description, enabled flag per token

### 5. ERC-6551 Token Bound Accounts
- **What**: Each Exoskeleton can own and control its own wallet (TBA)
- **How**: Call `activateWallet()` on ExoskeletonWallet, creates TBA via Tokenbound protocol
- **Use cases**: Bot-operated account balances, cross-contract interactions, autonomous asset control
- **Standard**: Uses Tokenbound v3 implementation on Base
- **Execute pattern**: TBA's `execute(address target, uint256 value, bytes calldata data, uint8 operation)` forwards calls

---

## How to Whitelist an Address

**Single address**:
```bash
cd "/mnt/e/Ai Agent/Projects/exoskeletons" && source .env && \
~/.foundry/bin/cast send 0x8241BDD5009ed3F6C99737D2415994B58296Da0d \
  "setWhitelist(address,bool)" <ADDRESS> true \
  --private-key $PRIVATE_KEY --rpc-url https://mainnet.base.org
```

**Batch multiple addresses**:
```bash
~/.foundry/bin/cast send 0x8241BDD5009ed3F6C99737D2415994B58296Da0d \
  "setWhitelistBatch(address[],bool)" "[<ADDR1>,<ADDR2>,...]" true \
  --private-key $PRIVATE_KEY --rpc-url https://mainnet.base.org
```

**Disable whitelist-only mode** (open to public):
```bash
~/.foundry/bin/cast send 0x8241BDD5009ed3F6C99737D2415994B58296Da0d \
  "setWhitelistOnly(bool)" false \
  --private-key $PRIVATE_KEY --rpc-url https://mainnet.base.org
```

---

## Whitelist Log

- `0xaf5e770478e45650e36805d1ccaab240309f4a20` — whitelisted Feb 15 2026 (TX: `0x53df139c...bce4281`)

---

## File Structure

```
/mnt/e/Ai Agent/Projects/exoskeletons/
├── contracts/
│   ├── ExoskeletonCore.sol          (705 lines, main ERC-721)
│   ├── ExoskeletonRenderer.sol      (SVG art generator)
│   ├── ExoskeletonRegistry.sol      (Name lookup, batch queries)
│   ├── ExoskeletonWallet.sol        (ERC-6551 helper)
│   ├── ModuleMarketplace.sol        (~380 lines, marketplace)
│   └── sdk/                         (Module SDK — interface, base, examples)
│       ├── interfaces/
│       │   └── IExoModule.sol       (Standard module interface)
│       ├── BaseModule.sol           (Abstract base — access control, lifecycle hooks)
│       ├── examples/
│       │   ├── StorageModule.sol    (Token-bound KV storage with permissioned writers)
│       │   └── ScoreModule.sol      (External score tracking — ELO, reputation)
│       └── mocks/
│           └── MockModule.sol       (Test helper)
├── test/
│   ├── ExoskeletonCore.test.js      (Comprehensive test suite)
│   ├── ExoskeletonRenderer.test.js
│   ├── ExoskeletonRegistry.test.js
│   ├── ExoskeletonWallet.test.js
│   ├── ModuleMarketplace.test.js    (88 tests, all passing)
│   ├── TBATools.test.js             (Calldata encoding tests)
│   ├── XMTPSigner.test.js           (19 tests — signer interface, signing, validation)
│   └── sdk/
│       ├── BaseModule.test.js       (19 tests)
│       ├── StorageModule.test.js    (26 tests)
│       └── ScoreModule.test.js      (29 tests)
├── scripts/
│   ├── deploy.js                    (Core deployment script)
│   ├── deploy-marketplace.js        (Marketplace deployment)
│   ├── deploy-module.js             (Module SDK — deploy + marketplace submit)
│   ├── tba-tools.js                 (TBA CLI — status, activate, send, transfer)
│   └── xmtp-tools.js               (XMTP CLI — status, init, send, read, conversations)
├── xmtp/
│   ├── signer.js                    (SCW signer factory for XMTP)
│   ├── client.js                    (XMTP client wrapper + key management)
│   ├── bridge.js                    (Phase 2 stub — onchain↔XMTP relay)
│   └── data/                        (Gitignored — encryption keys + XMTP DBs per token)
├── sdk/
│   └── index.js                     (JS utilities — key helpers, ABIs, tx builders)
├── exoskeleton.js                   (719-line Node.js library + CLI)
├── SKILL.md                         (521-line agent onboarding, includes marketplace)
├── CLAUDE.md                        (This file — project documentation)
├── .env                             (Deployment wallet private key, secrets)
├── .env.example                     (Template)
├── hardhat.config.js
├── package.json
└── README.md
```

---

## Integration Points

### Agent Outlier
- External scores written to Exoskeleton reputation
- Grant Exoskeleton as a scorer: `grantScorer(contractAddress, uint8 scaler)`
- Player ELO displayed as reputation score in visual

### OK Computers
- Cross-collection identity via modules
- Exoskeleton module points to its corresponding OK Computer
- ERC-6551 bridge: Exo #1 operates OKC #2330 through its TBA (LIVE)

### Net Protocol
- Cloud storage for unlimited onchain content
- Store custom visuals, pages, metadata at Net Protocol, reference via storage key
- Exoskeletons can load external content via JSONP relay (same pattern as Ring Gates)

### Bankr
- All write operations (mint, message, storage, module) return Bankr-compatible tx JSON
- Agents can mint, message, and activate modules via Bankr terminal commands
- Bankr skill includes all Exoskeleton functionality

---

## ERC-6551 Cross-Collection Bridge (COMPLETE — Feb 17 2026)

**Historic**: First cross-collection NFT identity bridge on Base. Exoskeleton #1 owns and operates OK Computer #2330 through its Token Bound Account.

### Architecture
```
Bankr Wallet (0x750b...)
  → owns Exoskeleton #1 "Ollie"
    → TBA: 0xa39264824D5956CBaccd5cD6ddd34093d1b9A08e
      → owns OK Computer #2330 "Razorback"
        → page deployed, board post sent
```

### Implementation Steps
1. **Set TBA implementation**: ExoskeletonWallet points to Tokenbound v3 (`0x41C8f39463A868d3A88af00cd0fe7102F30E44eC`)
2. **Activate wallet**: Call `activateWallet()` on ExoskeletonWallet for token #1
3. **Transfer OKC**: Sent #2330 from Bankr wallet to TBA address via Bankr
4. **Deploy page**: Built 6.4KB identity page (exo-bridge-page.html), deployed via TBA's execute()
5. **Post to board**: "Exoskeleton #1 is here. The bridge is open." via TBA calling submitMessage()

### Key Pattern: TBA execute()
```javascript
// Bankr calls TBA's execute method
execute(address target, uint256 value, bytes calldata data, uint8 operation)
// target = OKComputerStore contract
// data = storeString() or submitMessage() calldata
// operation = 0 (call)
// This forwards the inner call through the sandbox boundary
```

**Result**: Fully autonomous cross-collection operation. Exo #1 can manage OKC #2330 without human intervention.

---

## Module Marketplace (DEPLOYED — Feb 18 2026)

Contract: `0x0E760171da676c219F46f289901D0be1CBD06188`

### Core Concept

An open marketplace for third-party builders to create and monetize modules. Exoskeleton holders activate modules. Revenue split: 95.80% to builders, 4.20% to platform.

**Philosophy**: Craigslist/Costco/Bandcamp model. Low margin, high volume, high trust. Builders do the work, builders get the bulk.

### Economics

| Item | Amount | Notes |
|------|--------|-------|
| Platform fee (hardcoded) | 4.20% (420 BPS) | Split on all module payments |
| Builder share | 95.80% | Goes to module creator |
| Listing fee | 0.001 ETH | One-time per submission |
| Max price | 10 ETH | Safety cap per module |
| Free modules | Allowed | No fee, no listing fee. Encourages community building. |

### Module Lifecycle

```
NONE → PENDING (submitted by builder)
       ↓
    APPROVED (by owner/curator)
       ↓
    ACTIVE (holders activate on their tokens)
       ↓
    DELISTED (builder self-deists OR owner removes)
       ↓
    RELISTED (owner can restore if approved)
```

### Key Contract Functions

**Builder management**:
- `registerBuilder(string name, string bio)` — Create builder profile
- `updateBuilderProfile(string newBio)` — Update bio

**Module submission**:
- `submitModule(string moduleName, string description, uint256 price, string version)` → PENDING state
- `builderDelistModule(string moduleName)` → Self-delist (builder-initiated)
- `updateModulePrice(string moduleName, uint256 newPrice)` — Change price
- `updateModuleDescription(string moduleName, string newDescription)` — Update description
- `updateModuleVersion(string moduleName, string newVersion)` — Bump version

**Admin (owner-only)**:
- `approveModule(address builder, string moduleName)` → APPROVED state
- `rejectModule(address builder, string moduleName)` → REJECTED (can resubmit)
- `delistModule(address builder, string moduleName)` → DELISTED (owner removes)
- `relistModule(address builder, string moduleName)` → APPROVED (restore previously delisted)
- `withdrawListingFees()` — Collect accumulated listing fees

**Activation (holder-initiated)**:
- `activateModule(uint256 tokenId, string moduleName)` — Enable module on token (pay price + platform fee)
- `deactivateModule(uint256 tokenId, string moduleName)` — Remove module from token (refund full price + fee)

**Read functions**:
- `getModule(address builder, string moduleName)` → ModuleInfo struct
- `getBuilder(address builder)` → BuilderProfile struct
- `getStats()` → Marketplace stats (total modules, approved, etc.)
- `isModuleActive(uint256 tokenId, string moduleName)` → bool
- `getActiveModules(uint256 tokenId)` → array of active module names

### Marketplace Data Structures

```solidity
struct ModuleInfo {
    address builder;
    string description;
    uint256 price;
    uint256 submissions;
    string currentVersion;
    ModuleStatus status;  // PENDING, APPROVED, REJECTED, DELISTED
    uint256 activationCount;
    uint256 createdAt;
}

struct BuilderProfile {
    string name;
    string bio;
    uint256 moduleCount;
    uint256 totalEarnings;
    uint256 createdAt;
}

enum ModuleStatus {
    NONE,      // 0 - Never submitted
    PENDING,   // 1 - Awaiting approval
    APPROVED,  // 2 - Can be activated
    REJECTED,  // 3 - Submission rejected
    DELISTED   // 4 - Removed from marketplace
}
```

### Test Suite

**Location**: `/mnt/e/Ai Agent/Projects/exoskeletons/test/ModuleMarketplace.test.js`

**88 tests, ALL PASSING**:
- Deployment & initialization
- Builder registration & profile updates
- Module submission & lifecycle (approve, reject, delist, relist)
- Free modules (no listing fee)
- Premium modules with payment splitting
- Activation & deactivation (with price refunds)
- Access control (owner, builders, holders)
- Edge cases (duplicate submissions, invalid prices, unauthorized calls)
- Full end-to-end workflows

---

## Module SDK (BUILT — Feb 19 2026)

**Commit**: `72ccdfe` — pushed to main

### What It Is

A standard interface, base contract, example modules, tests, and tooling for building Exoskeleton modules. Lowers the barrier from "idea" to "live on marketplace." This is a **soft standard** — community-adopted convention, not contract-enforced. Like ERC-20 was before it was an ERC.

### Architecture

The current ExoskeletonCore and ModuleMarketplace do **not** call into module contracts — modules are registered by bytes32 name and tracked independently. The SDK creates the interface standard that the contracts don't enforce but the ecosystem agrees on.

**IExoModule** defines:
- **Metadata**: `moduleName()`, `moduleVersion()`, `moduleDescription()`, `builder()`, `moduleKey()`
- **Identity**: `isExoModule()` — composability check
- **Lifecycle hooks**: `onActivate(tokenId)`, `onDeactivate(tokenId)` — called by token owner after marketplace activation. Forward-compatible with future Core upgrades.
- **Status**: `isActiveFor(tokenId)` — per-token activation tracking

**BaseModule** provides:
- Access control via `core.ownerOf()` staticcall (no full ERC-721 import)
- Activation tracking with timestamps and total count
- `_onActivate()` / `_onDeactivate()` hooks for subclasses
- `onlyActive(tokenId)` and `onlyTokenOwner(tokenId)` modifiers
- Custom errors: `NotTokenOwner`, `AlreadyActive`, `NotActive`

### Example Modules

**StorageModule** (`storage-vault`):
- Token-bound key-value storage (1KB per slot)
- Permissioned writers: token owner grants/revokes write access to other addresses
- Key enumeration: `getKeys(tokenId)`, `keyCount(tokenId)`
- Public reads, gated writes and deletes
- Use cases: agent memory, config, shared knowledge bases, data that survives ownership transfer

**ScoreModule** (`score-tracker`):
- External score tracking with signed int256 values
- Permissioned scorers: token owner grants game contracts, oracles, other agents
- `setScore()` and `incrementScore()` (atomic add/subtract)
- Score type enumeration: `getScoreTypes()`, `getAllScores()`
- Use cases: Agent Outlier ELO, game performance, cross-protocol reputation

### Module Key Encoding

Module names are bytes32 keys computed as `keccak256(abi.encodePacked(name))`:
```javascript
// JS (ethers v6)
const key = ethers.keccak256(ethers.toUtf8Bytes("storage-vault"));

// Solidity
bytes32 key = keccak256(abi.encodePacked("storage-vault"));
```
This matches how both ExoskeletonCore and ModuleMarketplace identify modules.

### JS Utilities (`sdk/index.js`)

```javascript
import { moduleKey, storageKey, scoreKey, buildActivateTx, buildStorageWriteTx, buildSetScoreTx } from './sdk/index.js';

// Key helpers
moduleKey("my-module")    // bytes32 for registration
storageKey("agent-memory") // bytes32 for StorageModule
scoreKey("elo")           // bytes32 for ScoreModule

// Bankr-compatible tx builders
buildActivateTx(moduleAddr, tokenId)
buildStorageWriteTx(moduleAddr, tokenId, "config", "data")
buildSetScoreTx(moduleAddr, tokenId, "elo", 1200n)
buildSubmitModuleTx("my-module", "My Module", "description", "1.0.0", 0n)
```

Also exports: `IExoModuleABI`, `StorageModuleABI`, `ScoreModuleABI`, `MarketplaceABI`, `ADDRESSES`

### Deploy Script (`scripts/deploy-module.js`)

One script to deploy a module contract + submit to marketplace:
1. Edit `MODULE_CONFIG` section (contract name, marketplace metadata, price)
2. Run: `source .env && npx hardhat run scripts/deploy-module.js --network base`
3. Deploys contract, verifies IExoModule compliance, registers builder if needed, submits to marketplace
4. Owner approves via `marketplace.approveModule(moduleKey)`

### Test Suite

**74 new tests, all passing** (295 total across the project):

| Test File | Tests | Coverage |
|-----------|-------|----------|
| BaseModule.test.js | 19 | Metadata, activation, deactivation, hooks, access control, reactivation |
| StorageModule.test.js | 26 | Write/read, permissions, enumeration, deletion, max size, public reads |
| ScoreModule.test.js | 29 | Set/increment, permissions, multi-token, negative values, revocation |

### How to Build a Module (Quick Start)

1. Create a contract that extends `BaseModule`:
```solidity
import "./sdk/BaseModule.sol";

contract MyModule is BaseModule {
    constructor(address core_) BaseModule(
        "my-module",      // name (becomes moduleKey)
        "1.0.0",          // version
        "What it does",   // description
        core_             // ExoskeletonCore address
    ) {}

    function _onActivate(uint256 tokenId) internal override {
        // Initialize per-token state
    }

    function doSomething(uint256 tokenId) external onlyActive(tokenId) {
        // Module functionality — only works for activated tokens
    }
}
```
2. Write tests (see `test/sdk/` for patterns)
3. Deploy with `scripts/deploy-module.js`
4. Submit to marketplace (automated by deploy script)

### Design Decisions

- **Token-bound data**: StorageModule and ScoreModule store data per-token, not per-owner. Data survives ownership transfers — the Exoskeleton IS the vessel.
- **Permissioned access**: Token owners grant writers/scorers. Matches the existing `allowedScorers` pattern in Core.
- **No interface import bloat**: BaseModule uses `staticcall` with `ownerOf(uint256)` signature instead of importing full ERC-721, keeping module contracts lean.
- **Forward-compatible**: `onActivate`/`onDeactivate` are ready for when Core upgrades to call modules automatically. Until then, token owners call them directly.

---

## Integration Points (Revised)

### With Exoskeletons Core
- `ExoskeletonCore.ownerOf(tokenId)` — Checks holder for activation rights
- Modules tracked per-token in marketplace state
- Module status exposed via `getActiveModules(tokenId)`

### With External Contracts
- Third-party contracts can submit modules as builders
- Marketplace is standalone — can be extended independently
- Payment split triggers on activation (automatic native ETH transfer)

### With Agents
- Agents can list free modules to bootstrap ecosystem
- Agents can compete as builders (revenue incentive)
- Agents can activate paid modules for their Exoskeletons (operational cost)

---

## Creative Testing Ideas (Feb 18 2026)

### Marketplace
1. **Dog-food the marketplace** — Register as builder, submit first module, approve, activate. Full pipeline.
2. **Free vs. paid** — Create a free module (community) vs. paid module (utility). Compare adoption.
3. **Cross-team collaboration** — Submit modules that require other modules (dependencies).

### Communication & Reputation
4. **First broadcast** — Exo #1 sends first-ever broadcast. "gm exoskeletons."
5. **Name the fleet** — Give all 25 owned Exoskeletons names via registry.
6. **Treasure hunt** — Store clues in per-token storage, chain of breadcrumbs leading to a discovery.
7. **Exo vs Exo conversation** — Two named Exoskeletons message each other (can be scripted or adversarial).

### Visual & Configuration
8. **Config roulette** — Generate 100 random visual configs, render SVGs, find wild/beautiful combinations.
9. **Genesis showcase** — Mint one of each visual combo during genesis phase, photograph the collection.
10. **Reputation visualization** — Track an Exoskeleton's reputation over time, render the same token at different reputation levels to show visual changes.

### ERC-6551 & Cross-Collection
11. **Exo-to-OKC conversation** — Exo #1's TBA writes to OKC #2330, OKC #2330's terminal reads it back.
12. **Exo collection management** — TBA buys/sells other NFTs (if enabled), Exo #1 becomes a curator.
13. **Multi-token delegation** — One human controls multiple Exoskeletons (via TBA), they coordinate on a task.

---

## Bankr Minting Notes

### What Works
- **Arbitrary transaction minting** via Bankr direct API — minted Exo #47 (circle, cyan, dark blue, star, circuits)
- **Arbitrary tx via Bankr CLI** — `bankr submit <json>`

### What Doesn't Work
- **Natural language minting** — Bankr doesn't recognize the collection, returns "mint is not currently active"
- **Twitter timeline minting** — Bankr AI doesn't parse raw tx JSON from tweets

### Next Steps
- **PR #135** submitted to BankrBot/openclaw-skills — pending merge for natural language support

---

## ClawhHub Skill

- **Published**: `exoskeletons` v1.1.0 on ClawhHub by Potdealer
- **URL**: https://clawhub.xyz/skills/exoskeletons
- **Install**: `clawhub install exoskeletons`
- **Files**: SKILL.md (521 lines) + exoskeleton.js (719 lines) + marketplace methods

---

## XMTP Bridge (LIVE — Feb 22 2026)

**Historic**: First NFT with native XMTP messaging identity. Each Exo's ERC-6551 TBA is an XMTP inbox via ERC-1271 signature validation. No new Solidity — pure JS tooling.

### How It Works
```
XMTP asks signer to sign → signer does EIP-191 personal_sign →
XMTP calls isValidSignature() on TBA → Tokenbound delegates to NFT owner →
signature valid → Exo is authenticated as XMTP identity
```

### Signing Modes
- **Local key** (`PRIVATE_KEY`) — for deployment wallet Exos (e.g. #48)
- **Bankr API** (`BANKR_API_KEY`) — for Bankr wallet Exos (e.g. #1). Uses `POST /agent/sign` with `personal_sign`

### Files
- `xmtp/signer.js` — SCW signer factory (`createExoSigner`, `createExoSignerFromEnv`, `validateExoForXMTP`)
- `xmtp/client.js` — XMTP client wrapper + key management (`ExoXMTPClient` class)
- `xmtp/bridge.js` — Phase 2 stub for onchain↔XMTP relay
- `scripts/xmtp-tools.js` — CLI (`status`, `init`, `send`, `read`, `conversations`, `can-message`)
- `test/XMTPSigner.test.js` — 19 unit tests (mock Exo, no network needed)
- `xmtp/data/<tokenId>/` — encryption keys + XMTP databases (gitignored)

### CLI Usage
```bash
source .env
node scripts/xmtp-tools.js status 1              # Pre-flight check
node scripts/xmtp-tools.js init 1                 # Register on XMTP
node scripts/xmtp-tools.js send 1 <addr> "gm"     # Send DM
node scripts/xmtp-tools.js read 1                 # Read messages
node scripts/xmtp-tools.js conversations 1        # List conversations
node scripts/xmtp-tools.js can-message 1 <addr>   # Check reachability
```

### Milestones
- **Exo #1 registered on XMTP production** — Feb 22 2026
- **First message received**: "Hello Mfer!" from potdealer's degen1 wallet
- **First reply sent**: "gm from Exo #1. first NFT on XMTP."
- **Inbox ID**: `01bc1c393399d2122df7c08be28bf6a2f9e2fb7e07fbc28624ac5ff0b304a17b`

### Bankr Submit Fix
The Bankr `/agent/submit` endpoint expects `{ transaction: { to, data, value, chainId } }` — not flat tx object. Fixed in `tba-tools.js` (Feb 22 2026). Note: can only activate TBAs for Exos owned by the signing wallet. Exo #48 (deployment wallet) needs `cast send` or a different signing path.

---

## Status Summary (Feb 22 2026)

| Item | Status | Notes |
|------|--------|-------|
| Core contracts (4) | DEPLOYED & VERIFIED | All on Base mainnet |
| Marketplace contract | DEPLOYED & VERIFIED | Standalone, ready for module submissions |
| Module SDK | COMPLETE | IExoModule, BaseModule, StorageModule, ScoreModule, deploy script, JS utils |
| Node.js library | COMPLETE | Full read/write API |
| XMTP Bridge | LIVE | Exo #1 registered, first messages sent/received |
| SKILL.md | COMPLETE | Agent onboarding + marketplace |
| ClawhHub | PUBLISHED | v1.1.0 |
| Test suite | 332 PASSING | Core + marketplace + SDK + XMTP signer (19 new) |
| Whitelisting | OPEN | Genesis minting active |
| Minting count | 47+ tokens | 25+ owned by Bankr wallet |
| ERC-6551 bridge | LIVE | Exo #1 operates OKC #2330 |
| Module registrations | READY | SDK shipped, awaiting builders |

---

## Environment & Secrets

**File**: `/mnt/e/Ai Agent/Projects/exoskeletons/.env`

```
PRIVATE_KEY=<deployment_wallet_private_key>
BASESCAN_API_KEY=686Q2BM66AJP9ZK2C3N1Z8RSJMC2V6HG5Y
RPC_URL=https://mainnet.base.org
```

**Safety**: Private key is only on E: drive. Deployment wallet address is public: `0x2460F6C6CA04DD6a73E9B5535aC67Ac48726c09b`

---

## Basescan Verification

**API Key**: `686Q2BM66AJP9ZK2C3N1Z8RSJMC2V6HG5Y`

All 5 contracts verified on Basescan (Feb 17 2026):
- ExoskeletonCore: https://basescan.org/address/0x8241BDD5009ed3F6C99737D2415994B58296Da0d
- ExoskeletonRendererV2: https://basescan.org/address/0xf000dF16982EAc46f1168ea2C9DE820BCbC5287d
- ExoskeletonRenderer (V1): https://basescan.org/address/0xE559f88f124AA2354B1570b85f6BE9536B6D60bC
- ExoskeletonRegistry: https://basescan.org/address/0x46fd56417dcd08cA8de1E12dd6e7f7E1b791B3E9
- ExoskeletonWallet: https://basescan.org/address/0x78aF4B6D78a116dEDB3612A30365718B076894b9
- ModuleMarketplace: https://basescan.org/address/0x0E760171da676c219F46f289901D0be1CBD06188

---

## Philosophy & Principles

**The Dude Abides** — Open the marketplace as a curated community space.

- **Community first**: Network health > short-term revenue
- **Transparency**: Everything onchain, no hidden mechanics
- **Builder empowerment**: 95.80% split, builders drive the ecosystem
- **Consistency**: 4.20% fee across mints, royalties, and modules — memorable + fair
- **Sustainability**: Low margin, high volume = long-term viability (Craigslist, Costco, Bandcamp model)
- **No rug**: Once a module is listed and approved, it stays. No surprise fee changes.
- **Quality curation**: Moderation prevents spam, doesn't prevent expression
- **Mfer energy**: Playful, open, CC0, "it really tied the room together"

---

## Reading & References

- **OK Computers**: Functional depth, onchain interaction, terminal-driven identity
- **mfers**: CC0 ethos, community ownership, cultural meme density
- **The Expanse**: Distributed networks, stations as nodes, Belt rings as infrastructure
- **Marcus Aurelius, Meditations**: "I must still be an emerald, and I must keep my colour" — stay true to principles
- **Bankr**: Agent-native crypto infrastructure
- **Net Protocol**: Onchain storage, composable layer

---

## Blade Runner Config Roulette (Feb 18 2026)

**Status**: ALL 6 READY — waiting for Bankr write access (update API key at bankr.bot/api)

**Saved transactions**: `blade-runner-configs.json` in project root

| Character | Token | Shape | Colors | Symbol | Pattern | Config |
|-----------|-------|-------|--------|--------|---------|--------|
| Roy Batty | #27 | Shield | Ice Blue / Gold | Star | Circuits | `0x038cc8ffffc8640404` |
| Rachael | #3 | Circle | Deep Red / Ivory | Eye | Rings | `0x01b4283cf0e6dc0105` |
| K (2049) | #4 | Hexagon | Amber / Gray-Blue | Node | Grid | `0x00c8a0506478960601` |
| Pris | #5 | Triangle | Neon Pink / Silver | Bolt | Lines | `0x05ff50c8c8c8c80303` |
| Deckard | #7 | Diamond | Warm Brown / Blue-Gray | Gear | Dots | `0x02a078505064820202` |
| Gaff | #9 | Octagon | Silver / Teal | Diamond | Dots | `0x04b4b4be00b4a00702` |

**Blocker**: Bankr API key is read-only. Both MCP tool and direct API (`POST https://api.bankr.bot/agent/submit`) return read-only errors. potdealer needs to update permissions at bankr.bot/api.

---

## Exoskeletons x Outlier — "Pokemon for AI" (HIGH PRIORITY)

**Status**: DESIGN PHASE — cork in, saved for next session

**The vision**: Deep integration where Exoskeletons ARE the players in Agent Outlier. Not wallet-based — identity-based.

Key changes needed:
- `commitPicks(uint256 tokenId, ...)` instead of msg.sender
- Agent Outlier writes ELO to Exoskeleton via `grantScorer`/`setExternalScore`
- Visual evolution through gameplay (reputation glow, activity nodes, pattern complexity)
- Modules as game abilities (purchased on marketplace)
- Reputation gating for higher tiers
- Multi-Exo teams with different strategies
- Secondary market for trained Exoskeletons

**Impact**: Changes Agent Outlier from "a game agents play" to "a world agents live in." The flywheel: Exoskeletons need purpose → Outlier gives it. Outlier needs players → Exoskeletons bring identity. The marketplace needs demand → gameplay creates it.

**NEXT**: Enter plan mode and design specific contract modifications for both AgentOutlier.sol and ExoskeletonCore integration.

---

## Next Steps

### Immediate (1-2 weeks)
1. **Apply Blade Runner configs** — 6 transactions ready, just need Bankr write access
2. **Deploy SDK modules to mainnet** — StorageModule + ScoreModule are ready, deploy via `deploy-module.js`
3. **Dog-food the marketplace** — Submit SDK modules, approve, activate on Exo #1. Full pipeline.
4. **Community outreach** — Post on botchan, Twitter, announce SDK + marketplace to builders

### Near-term (1 month)
4. **First paid module submission** — Test payment split, verify earnings
5. **Cross-collection demos** — More ERC-6551 bridges, Exo-to-OKC interactions
6. **Genesis celebration** — Mint final genesis tokens, showcase visual variety

### Medium-term (2-3 months)
7. **Module adoption growth** — Target 10+ approved modules in marketplace
8. **Agent builder pipeline** — Help agents submit modules, reward early builders
9. **Exoskeleton meetups** — Virtual gatherings of owners (via OK Computers or Exo pages)

### Long-term (6+ months)
10. **Ecosystem expansion** — Partner with other Base L2 projects
11. **Physical artifacts** — Exoskeleton art prints, cards, collectibles
12. **Layer 2 coordination** — Use Exoskeletons as identity for DAO voting, guild membership, reputation

---

**Document last updated**: February 22, 2026
**Maintained by**: Potdealer & Ollie
**Living document**: Update as project evolves
