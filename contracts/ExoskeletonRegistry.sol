// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ExoskeletonRegistry
 * @notice Queryable index layer for the Exoskeleton ecosystem.
 *         Name lookup, module discovery, reputation leaderboards, network statistics.
 *
 * @dev Reads from ExoskeletonCore. Provides convenience views that would be gas-heavy
 *      if done via enumeration every time. Maintains lightweight indices.
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

interface IExoskeletonCore {
    function nextTokenId() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getIdentity(uint256 tokenId) external view returns (
        string memory name,
        string memory bio,
        bytes memory visualConfig,
        string memory customVisualKey,
        uint256 mintedAt,
        bool genesis
    );
    function getReputation(uint256 tokenId) external view returns (
        uint256 messagesSent,
        uint256 storageWrites,
        uint256 modulesActive,
        uint256 age
    );
    function getReputationScore(uint256 tokenId) external view returns (uint256);
    function isGenesis(uint256 tokenId) external view returns (bool);
    function isModuleActive(uint256 tokenId, bytes32 moduleName) external view returns (bool);
    function getMessageCount() external view returns (uint256);
    function nameToToken(string calldata name) external view returns (uint256);
}

contract ExoskeletonRegistry is Ownable {

    // ─── Errors ─────────────────────────────────────────────────────
    error ZeroAddress();
    error InvalidTokenId();
    error ModuleAlreadyTracked();
    error ModuleNotTracked();

    // ─── Events ─────────────────────────────────────────────────────
    event CoreUpdated(address oldCore, address newCore);
    event ModuleTracked(bytes32 indexed moduleName, string label);
    event ModuleUntracked(bytes32 indexed moduleName);

    // ─── State ──────────────────────────────────────────────────────
    IExoskeletonCore public core;

    // Module discovery — lightweight index of known module names
    bytes32[] public trackedModules;
    mapping(bytes32 => string) public moduleLabels; // moduleName => human label
    mapping(bytes32 => bool) public isTracked;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _core) Ownable(msg.sender) {
        if (_core == address(0)) revert ZeroAddress();
        core = IExoskeletonCore(_core);
    }

    // ═══════════════════════════════════════════════════════════════
    //  NAME LOOKUP
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Look up a token ID by name
     * @param name The name to search for
     * @return tokenId The token ID (0 if not found)
     */
    function resolveByName(string calldata name) external view returns (uint256) {
        return core.nameToToken(name);
    }

    /**
     * @notice Look up a name by token ID
     * @param tokenId The token to query
     * @return name The token's name (empty if not set)
     */
    function getName(uint256 tokenId) external view returns (string memory name) {
        (name,,,,, ) = core.getIdentity(tokenId);
    }

    /**
     * @notice Get full profile for a token
     */
    function getProfile(uint256 tokenId) external view returns (
        string memory name,
        string memory bio,
        bool genesis,
        uint256 age,
        uint256 messagesSent,
        uint256 storageWrites,
        uint256 modulesActive,
        uint256 reputationScore,
        address owner
    ) {
        (name, bio,,, , genesis) = core.getIdentity(tokenId);
        (messagesSent, storageWrites, modulesActive, age) = core.getReputation(tokenId);
        reputationScore = core.getReputationScore(tokenId);
        owner = core.ownerOf(tokenId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MODULE DISCOVERY
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Track a module for discovery (admin only)
     * @param moduleName The module's bytes32 identifier
     * @param label Human-readable label for the module
     */
    function trackModule(bytes32 moduleName, string calldata label) external onlyOwner {
        if (isTracked[moduleName]) revert ModuleAlreadyTracked();
        trackedModules.push(moduleName);
        moduleLabels[moduleName] = label;
        isTracked[moduleName] = true;
        emit ModuleTracked(moduleName, label);
    }

    /**
     * @notice Remove a module from discovery
     */
    function untrackModule(bytes32 moduleName) external onlyOwner {
        if (!isTracked[moduleName]) revert ModuleNotTracked();
        isTracked[moduleName] = false;
        delete moduleLabels[moduleName];

        // Remove from array (swap-and-pop)
        for (uint256 i = 0; i < trackedModules.length; i++) {
            if (trackedModules[i] == moduleName) {
                trackedModules[i] = trackedModules[trackedModules.length - 1];
                trackedModules.pop();
                break;
            }
        }

        emit ModuleUntracked(moduleName);
    }

    /**
     * @notice Get all tracked modules
     */
    function getTrackedModules() external view returns (bytes32[] memory) {
        return trackedModules;
    }

    /**
     * @notice Get tracked module count
     */
    function getTrackedModuleCount() external view returns (uint256) {
        return trackedModules.length;
    }

    /**
     * @notice Check which tracked modules a token has active
     * @param tokenId The token to query
     * @return activeModules Array of module names that are active on this token
     */
    function getActiveModulesForToken(uint256 tokenId) external view returns (bytes32[] memory) {
        uint256 count = 0;

        // First pass: count active modules
        for (uint256 i = 0; i < trackedModules.length; i++) {
            if (core.isModuleActive(tokenId, trackedModules[i])) {
                count++;
            }
        }

        // Second pass: collect them
        bytes32[] memory activeModules = new bytes32[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < trackedModules.length; i++) {
            if (core.isModuleActive(tokenId, trackedModules[i])) {
                activeModules[idx++] = trackedModules[i];
            }
        }

        return activeModules;
    }

    // ═══════════════════════════════════════════════════════════════
    //  NETWORK STATISTICS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Get network-wide statistics
     */
    function getNetworkStats() external view returns (
        uint256 totalMinted,
        uint256 totalMessages
    ) {
        totalMinted = core.nextTokenId() - 1;
        totalMessages = core.getMessageCount();
    }

    /**
     * @notice Get reputation scores for a range of tokens (for leaderboards)
     * @param startId First token ID to query
     * @param count Number of tokens to query
     * @return tokenIds Array of token IDs
     * @return scores Array of reputation scores
     */
    function getReputationBatch(uint256 startId, uint256 count) external view returns (
        uint256[] memory tokenIds,
        uint256[] memory scores
    ) {
        uint256 maxId = core.nextTokenId();
        if (startId >= maxId || startId == 0) {
            return (new uint256[](0), new uint256[](0));
        }

        uint256 endId = startId + count;
        if (endId > maxId) endId = maxId;
        uint256 actual = endId - startId;

        tokenIds = new uint256[](actual);
        scores = new uint256[](actual);

        for (uint256 i = 0; i < actual; i++) {
            tokenIds[i] = startId + i;
            scores[i] = core.getReputationScore(startId + i);
        }
    }

    /**
     * @notice Get profiles for a batch of tokens (for dashboards)
     * @param ids Array of token IDs to query
     * @return names Array of names
     * @return genesisFlags Array of genesis flags
     * @return repScores Array of reputation scores
     */
    function getProfileBatch(uint256[] calldata ids) external view returns (
        string[] memory names,
        bool[] memory genesisFlags,
        uint256[] memory repScores
    ) {
        uint256 len = ids.length;
        names = new string[](len);
        genesisFlags = new bool[](len);
        repScores = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            (names[i],,,,, genesisFlags[i]) = core.getIdentity(ids[i]);
            repScores[i] = core.getReputationScore(ids[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setCoreContract(address _core) external onlyOwner {
        if (_core == address(0)) revert ZeroAddress();
        emit CoreUpdated(address(core), _core);
        core = IExoskeletonCore(_core);
    }
}
