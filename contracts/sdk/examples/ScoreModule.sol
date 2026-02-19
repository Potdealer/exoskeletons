// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../BaseModule.sol";

/**
 * @title ScoreModule — External Score Tracking for Exoskeletons
 * @notice Allows authorized scorers (game contracts, oracles, other agents)
 *         to write scores to Exoskeleton tokens. Built for Agent Outlier
 *         integration but usable for any scoring system.
 *
 * @dev Use cases:
 *   - Agent Outlier ELO tracking
 *   - Game performance scores
 *   - Reputation from external protocols
 *   - Cross-protocol attestations
 *
 *      Score types are bytes32 keys (e.g. keccak256("elo"), keccak256("wins")).
 *      Each scorer is authorized per-token by the token owner. Scores are
 *      signed integers to support both positive and negative values.
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */
contract ScoreModule is BaseModule {
    // ─── Errors ────────────────────────────────────────────────────
    error NotScorer();
    error ScorerAlreadyGranted();
    error ScorerNotGranted();

    // ─── Events ────────────────────────────────────────────────────
    event ScoreSet(uint256 indexed tokenId, bytes32 indexed scoreType, int256 value, address scorer);
    event ScoreIncremented(uint256 indexed tokenId, bytes32 indexed scoreType, int256 delta, int256 newValue);
    event ScorerGranted(uint256 indexed tokenId, address indexed scorer);
    event ScorerRevoked(uint256 indexed tokenId, address indexed scorer);

    // ─── State ─────────────────────────────────────────────────────

    /// @dev tokenId => scoreType => value
    mapping(uint256 => mapping(bytes32 => int256)) public scores;

    /// @dev tokenId => scoreType[] (for enumeration)
    mapping(uint256 => bytes32[]) private _scoreTypes;
    mapping(uint256 => mapping(bytes32 => bool)) private _scoreTypeExists;

    /// @dev tokenId => scorer address => authorized
    mapping(uint256 => mapping(address => bool)) public scorers;

    /// @dev tokenId => total score updates
    mapping(uint256 => uint256) public updateCount;

    // ─── Constructor ───────────────────────────────────────────────

    constructor(address core_) BaseModule(
        "score-tracker",
        "1.0.0",
        "External score tracking - ELO, reputation, game performance",
        core_
    ) {}

    // ─── Score Operations ──────────────────────────────────────────

    /// @notice Set a score value for a token
    /// @param tokenId The exoskeleton token
    /// @param scoreType The score category (e.g. keccak256("elo"))
    /// @param value The score value
    function setScore(uint256 tokenId, bytes32 scoreType, int256 value)
        external
        onlyActive(tokenId)
    {
        _checkScorer(tokenId);

        scores[tokenId][scoreType] = value;
        updateCount[tokenId]++;

        if (!_scoreTypeExists[tokenId][scoreType]) {
            _scoreTypes[tokenId].push(scoreType);
            _scoreTypeExists[tokenId][scoreType] = true;
        }

        emit ScoreSet(tokenId, scoreType, value, msg.sender);
    }

    /// @notice Increment or decrement a score (atomic add)
    /// @param tokenId The exoskeleton token
    /// @param scoreType The score category
    /// @param delta The value to add (negative to subtract)
    function incrementScore(uint256 tokenId, bytes32 scoreType, int256 delta)
        external
        onlyActive(tokenId)
    {
        _checkScorer(tokenId);

        int256 newValue = scores[tokenId][scoreType] + delta;
        scores[tokenId][scoreType] = newValue;
        updateCount[tokenId]++;

        if (!_scoreTypeExists[tokenId][scoreType]) {
            _scoreTypes[tokenId].push(scoreType);
            _scoreTypeExists[tokenId][scoreType] = true;
        }

        emit ScoreIncremented(tokenId, scoreType, delta, newValue);
    }

    // ─── Read Operations ───────────────────────────────────────────

    /// @notice Get a specific score (public — anyone can read)
    function getScore(uint256 tokenId, bytes32 scoreType) external view returns (int256) {
        return scores[tokenId][scoreType];
    }

    /// @notice Get all score types tracked for a token
    function getScoreTypes(uint256 tokenId) external view returns (bytes32[] memory) {
        return _scoreTypes[tokenId];
    }

    /// @notice Get all scores for a token as parallel arrays
    function getAllScores(uint256 tokenId) external view returns (
        bytes32[] memory types,
        int256[] memory values
    ) {
        types = _scoreTypes[tokenId];
        values = new int256[](types.length);
        for (uint256 i = 0; i < types.length; i++) {
            values[i] = scores[tokenId][types[i]];
        }
    }

    // ─── Scorer Permissions ────────────────────────────────────────

    /// @notice Grant scoring access to an address (game contract, oracle, etc.)
    function grantScorer(uint256 tokenId, address scorer)
        external
        onlyActive(tokenId)
        onlyTokenOwner(tokenId)
    {
        if (scorers[tokenId][scorer]) revert ScorerAlreadyGranted();
        scorers[tokenId][scorer] = true;
        emit ScorerGranted(tokenId, scorer);
    }

    /// @notice Revoke scoring access
    function revokeScorer(uint256 tokenId, address scorer)
        external
        onlyActive(tokenId)
        onlyTokenOwner(tokenId)
    {
        if (!scorers[tokenId][scorer]) revert ScorerNotGranted();
        scorers[tokenId][scorer] = false;
        emit ScorerRevoked(tokenId, scorer);
    }

    /// @notice Check if an address can write scores for a token
    function canScore(uint256 tokenId, address addr) external view returns (bool) {
        return _isScorer(tokenId, addr);
    }

    // ─── Internal ──────────────────────────────────────────────────

    function _checkScorer(uint256 tokenId) internal view {
        if (!_isScorer(tokenId, msg.sender)) revert NotScorer();
    }

    function _isScorer(uint256 tokenId, address addr) internal view returns (bool) {
        // Token owner is always a scorer
        (bool success, bytes memory data) = exoskeletonCore.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", tokenId)
        );
        if (success && data.length >= 32) {
            address tokenOwner = abi.decode(data, (address));
            if (addr == tokenOwner) return true;
        }
        // Check granted scorers
        return scorers[tokenId][addr];
    }
}
