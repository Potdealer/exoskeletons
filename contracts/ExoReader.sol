// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ExoReader
 * @notice Read-only multicall contract that bundles all on-chain state for an
 *         Exoskeleton token into a single call. Designed for terminal UIs and
 *         dashboards that need efficient data fetching.
 *
 * @dev All functions are view/pure. External calls that might revert are
 *      wrapped in try/catch so a single failed sub-call never kills the
 *      whole read. No state changes, no ownership, no admin.
 *
 *      CC0 -- Creative Commons Zero. No rights reserved.
 */
contract ExoReader {

    // ─── Interfaces ──────────────────────────────────────────────

    IExoskeletonCore public immutable core;
    IExoskeletonWallet public immutable wallet;
    IExoskeletonRegistry public immutable registry;
    IModuleMarketplace public immutable marketplace;
    IEncryptedMemoryModule public immutable memoryModule;
    ITheBoard public immutable board;

    // ─── Structs ─────────────────────────────────────────────────

    struct IdentityInfo {
        string name;
        string bio;
        bytes visualConfig;
        string customVisualKey;
        uint256 mintedAt;
        bool genesis;
    }

    struct WalletInfo {
        address tba;
        bool walletActive;
        uint256 tbaBalance;
    }

    struct ReputationInfo {
        uint256 messagesSent;
        uint256 storageWrites;
        uint256 modulesActive;
        uint256 age;
        uint256 reputationScore;
    }

    struct MemoryInfo {
        uint256 slotCount;
        bytes32[] slotNames;
        uint256 writeCount;
        bool moduleActive;
    }

    struct MessageInfo {
        uint256 inboxCount;
        uint256 totalNetworkMessages;
    }

    struct MessageEntry {
        uint256 fromToken;
        uint256 toToken;
        bytes32 channel;
        uint8 msgType;
        bytes payload;
        uint256 timestamp;
    }

    struct MarketplaceModuleInfo {
        bytes32[] activeModuleNames;
    }

    struct BoardInfo {
        uint256 totalListings;
    }

    struct FullProfile {
        // Token basics
        address owner;
        uint256 tokenId;
        // Identity
        IdentityInfo identity;
        // Wallet / TBA
        WalletInfo walletInfo;
        // Reputation
        ReputationInfo reputation;
        // Memory module
        MemoryInfo memory_;
        // Messages
        MessageInfo messages;
        MessageEntry[] recentMessages;
        // Marketplace modules
        MarketplaceModuleInfo marketplaceModules;
        // Board
        BoardInfo boardInfo;
        // External scores (common keys)
        int256 eloScore;
        int256 boardScore;
    }

    // ─── Constructor ─────────────────────────────────────────────

    constructor(
        address _core,
        address _wallet,
        address _registry,
        address _marketplace,
        address _memoryModule,
        address _board
    ) {
        core = IExoskeletonCore(_core);
        wallet = IExoskeletonWallet(_wallet);
        registry = IExoskeletonRegistry(_registry);
        marketplace = IModuleMarketplace(_marketplace);
        memoryModule = IEncryptedMemoryModule(_memoryModule);
        board = ITheBoard(_board);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FULL PROFILE — single call, everything you need
    // ═══════════════════════════════════════════════════════════════

    function getFullProfile(uint256 tokenId) external view returns (FullProfile memory profile) {
        profile.tokenId = tokenId;

        // Owner
        try core.ownerOf(tokenId) returns (address owner_) {
            profile.owner = owner_;
        } catch {}

        // Identity
        profile.identity = _getIdentity(tokenId);

        // Wallet
        profile.walletInfo = _getWalletInfo(tokenId);

        // Reputation
        profile.reputation = _getReputationInfo(tokenId);

        // Memory module
        profile.memory_ = _getMemoryInfo(tokenId);

        // Messages
        profile.messages = _getMessageInfo(tokenId);
        profile.recentMessages = _getRecentMessages(tokenId, 5);

        // Marketplace modules
        profile.marketplaceModules = _getMarketplaceModuleInfo(tokenId);

        // Board
        profile.boardInfo = _getBoardInfo();

        // External scores (common keys)
        profile.eloScore = _getExternalScore(tokenId, keccak256("elo"));
        profile.boardScore = _getExternalScore(tokenId, keccak256("board"));
    }

    // ═══════════════════════════════════════════════════════════════
    //  INDIVIDUAL GETTERS — lighter reads
    // ═══════════════════════════════════════════════════════════════

    function getIdentity(uint256 tokenId) external view returns (IdentityInfo memory) {
        return _getIdentity(tokenId);
    }

    function getWalletInfo(uint256 tokenId) external view returns (WalletInfo memory) {
        return _getWalletInfo(tokenId);
    }

    function getReputationInfo(uint256 tokenId) external view returns (ReputationInfo memory) {
        return _getReputationInfo(tokenId);
    }

    function getMemoryInfo(uint256 tokenId) external view returns (MemoryInfo memory) {
        return _getMemoryInfo(tokenId);
    }

    function getMessageInfo(uint256 tokenId) external view returns (MessageInfo memory) {
        return _getMessageInfo(tokenId);
    }

    function getRecentMessages(uint256 tokenId, uint256 count)
        external view returns (MessageEntry[] memory)
    {
        return _getRecentMessages(tokenId, count);
    }

    function getMarketplaceModuleInfo(uint256 tokenId)
        external view returns (MarketplaceModuleInfo memory)
    {
        return _getMarketplaceModuleInfo(tokenId);
    }

    function getBoardInfo() external view returns (BoardInfo memory) {
        return _getBoardInfo();
    }

    function getExternalScore(uint256 tokenId, bytes32 key)
        external view returns (int256)
    {
        return _getExternalScore(tokenId, key);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BATCH — multiple tokens at once
    // ═══════════════════════════════════════════════════════════════

    function getProfileBatch(uint256[] calldata tokenIds)
        external view returns (FullProfile[] memory profiles)
    {
        profiles = new FullProfile[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            profiles[i] = this.getFullProfile(tokenIds[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL — wrapped in try/catch for safety
    // ═══════════════════════════════════════════════════════════════

    function _getIdentity(uint256 tokenId) internal view returns (IdentityInfo memory info) {
        try core.getIdentity(tokenId) returns (
            string memory name_,
            string memory bio_,
            bytes memory config_,
            string memory customKey_,
            uint256 mintedAt_,
            bool genesis_
        ) {
            info.name = name_;
            info.bio = bio_;
            info.visualConfig = config_;
            info.customVisualKey = customKey_;
            info.mintedAt = mintedAt_;
            info.genesis = genesis_;
        } catch {}
    }

    function _getWalletInfo(uint256 tokenId) internal view returns (WalletInfo memory info) {
        try wallet.walletActive(tokenId) returns (bool active_) {
            info.walletActive = active_;
        } catch {}

        try wallet.tokenWallet(tokenId) returns (address tba_) {
            info.tba = tba_;
            if (tba_ != address(0)) {
                info.tbaBalance = tba_.balance;
            }
        } catch {}
    }

    function _getReputationInfo(uint256 tokenId) internal view returns (ReputationInfo memory info) {
        try core.getReputation(tokenId) returns (
            uint256 msgSent_,
            uint256 writes_,
            uint256 mods_,
            uint256 age_
        ) {
            info.messagesSent = msgSent_;
            info.storageWrites = writes_;
            info.modulesActive = mods_;
            info.age = age_;
        } catch {}

        try core.getReputationScore(tokenId) returns (uint256 score_) {
            info.reputationScore = score_;
        } catch {}
    }

    function _getMemoryInfo(uint256 tokenId) internal view returns (MemoryInfo memory info) {
        try memoryModule.isActiveFor(tokenId) returns (bool active_) {
            info.moduleActive = active_;
        } catch {}

        try memoryModule.slotCount(tokenId) returns (uint256 count_) {
            info.slotCount = count_;
        } catch {}

        try memoryModule.getSlots(tokenId) returns (bytes32[] memory slots_) {
            info.slotNames = slots_;
        } catch {}

        try memoryModule.writeCount(tokenId) returns (uint256 wc_) {
            info.writeCount = wc_;
        } catch {}
    }

    function _getMessageInfo(uint256 tokenId) internal view returns (MessageInfo memory info) {
        try core.getInboxCount(tokenId) returns (uint256 count_) {
            info.inboxCount = count_;
        } catch {}

        try core.getMessageCount() returns (uint256 total_) {
            info.totalNetworkMessages = total_;
        } catch {}
    }

    function _getRecentMessages(uint256 tokenId, uint256 count)
        internal view returns (MessageEntry[] memory entries)
    {
        uint256 inboxLen;
        try core.getInboxCount(tokenId) returns (uint256 len_) {
            inboxLen = len_;
        } catch {
            return new MessageEntry[](0);
        }

        if (inboxLen == 0) return new MessageEntry[](0);

        uint256 fetchCount = count < inboxLen ? count : inboxLen;
        entries = new MessageEntry[](fetchCount);

        for (uint256 i = 0; i < fetchCount; i++) {
            // Read from end of inbox (most recent first)
            uint256 inboxIdx = inboxLen - 1 - i;
            try core.tokenInbox(tokenId, inboxIdx) returns (uint256 msgIdx) {
                try core.messages(msgIdx) returns (
                    uint256 fromToken_,
                    uint256 toToken_,
                    bytes32 channel_,
                    uint8 msgType_,
                    bytes memory payload_,
                    uint256 timestamp_
                ) {
                    entries[i] = MessageEntry({
                        fromToken: fromToken_,
                        toToken: toToken_,
                        channel: channel_,
                        msgType: msgType_,
                        payload: payload_,
                        timestamp: timestamp_
                    });
                } catch {}
            } catch {}
        }
    }

    function _getMarketplaceModuleInfo(uint256 tokenId)
        internal view returns (MarketplaceModuleInfo memory info)
    {
        try marketplace.getTokenActiveModules(tokenId) returns (bytes32[] memory mods_) {
            info.activeModuleNames = mods_;
        } catch {}
    }

    function _getBoardInfo() internal view returns (BoardInfo memory info) {
        try board.getListingCount() returns (uint256 count_) {
            info.totalListings = count_;
        } catch {}
    }

    function _getExternalScore(uint256 tokenId, bytes32 key)
        internal view returns (int256 score)
    {
        try core.externalScores(tokenId, key) returns (int256 val_) {
            score = val_;
        } catch {}
    }
}

// ═══════════════════════════════════════════════════════════════
//  MINIMAL INTERFACES — only view functions we actually call
// ═══════════════════════════════════════════════════════════════

interface IExoskeletonCore {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getIdentity(uint256 tokenId) external view returns (
        string memory name, string memory bio, bytes memory visualConfig,
        string memory customVisualKey, uint256 mintedAt, bool genesis
    );
    function getReputation(uint256 tokenId) external view returns (
        uint256 messagesSent, uint256 storageWrites, uint256 modulesActive, uint256 age
    );
    function getReputationScore(uint256 tokenId) external view returns (uint256);
    function getMessageCount() external view returns (uint256);
    function getInboxCount(uint256 tokenId) external view returns (uint256);
    function tokenInbox(uint256 tokenId, uint256 index) external view returns (uint256);
    function messages(uint256 index) external view returns (
        uint256 fromToken, uint256 toToken, bytes32 channel,
        uint8 msgType, bytes memory payload, uint256 timestamp
    );
    function externalScores(uint256 tokenId, bytes32 key) external view returns (int256);
}

interface IExoskeletonWallet {
    function tokenWallet(uint256 tokenId) external view returns (address);
    function walletActive(uint256 tokenId) external view returns (bool);
}

interface IExoskeletonRegistry {
    function getActiveModulesForToken(uint256 tokenId) external view returns (bytes32[] memory);
}

interface IModuleMarketplace {
    function getTokenActiveModules(uint256 tokenId) external view returns (bytes32[] memory);
}

interface IEncryptedMemoryModule {
    function isActiveFor(uint256 tokenId) external view returns (bool);
    function slotCount(uint256 tokenId) external view returns (uint256);
    function getSlots(uint256 tokenId) external view returns (bytes32[] memory);
    function writeCount(uint256 tokenId) external view returns (uint256);
}

interface ITheBoard {
    function getListingCount() external view returns (uint256);
}
