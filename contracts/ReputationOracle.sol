// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReputationOracle
 * @notice Aggregates reputation scores from multiple sources into a single
 *         weighted composite score per Exoskeleton NFT.
 * @dev Sources (e.g., AgentOutlier, BoardEscrow, ACP) report raw scores.
 *      Anyone can trigger recalculation, which computes a weighted average
 *      and writes the result to ExoskeletonCore via setExternalScore.
 *
 *      Weights use basis points (10000 = 100%). Weights do NOT need to sum
 *      to 10000 — the oracle normalizes by dividing by total weight.
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */

interface IExoskeletonCore {
    function setExternalScore(uint256 tokenId, bytes32 scoreKey, int256 value) external;
}

contract ReputationOracle is Ownable {

    // ─── Errors ─────────────────────────────────────────────────────
    error SourceAlreadyRegistered();
    error SourceNotRegistered();
    error ZeroAddress();
    error ZeroWeight();
    error NoSources();

    // ─── Events ─────────────────────────────────────────────────────
    event SourceAdded(address indexed source, string name, uint256 weight);
    event SourceRemoved(address indexed source);
    event WeightUpdated(address indexed source, uint256 oldWeight, uint256 newWeight);
    event ScoreReported(address indexed source, uint256 indexed tokenId, uint256 score);
    event ReputationRecalculated(uint256 indexed tokenId, uint256 newScore);
    event CoreUpdated(address oldCore, address newCore);
    event ScoreKeyUpdated(bytes32 oldKey, bytes32 newKey);

    // ─── Structs ────────────────────────────────────────────────────
    struct Source {
        string name;
        uint256 weight;     // basis points (e.g., 4000 = 40%)
        bool registered;
    }

    // ─── State ──────────────────────────────────────────────────────
    IExoskeletonCore public core;
    bytes32 public scoreKey; // key used when writing to ExoskeletonCore

    mapping(address => Source) public sources;
    address[] public sourceList;
    uint256 public totalWeight;

    // source => tokenId => score
    mapping(address => mapping(uint256 => uint256)) public sourceScores;

    // tokenId => cached aggregate reputation
    mapping(uint256 => uint256) public reputationScores;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(
        address _core,
        bytes32 _scoreKey
    ) Ownable(msg.sender) {
        if (_core == address(0)) revert ZeroAddress();
        core = IExoskeletonCore(_core);
        scoreKey = _scoreKey;
    }

    // ═══════════════════════════════════════════════════════════════
    //  SOURCE MANAGEMENT (OWNER ONLY)
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Register a new score source with a name and weight.
     * @param source Address of the source contract (e.g., AgentOutlier)
     * @param name Human-readable name for the source
     * @param weight Weight in basis points (e.g., 4000 = 40%)
     */
    function addSource(address source, string calldata name, uint256 weight) external onlyOwner {
        if (source == address(0)) revert ZeroAddress();
        if (weight == 0) revert ZeroWeight();
        if (sources[source].registered) revert SourceAlreadyRegistered();

        sources[source] = Source({
            name: name,
            weight: weight,
            registered: true
        });
        sourceList.push(source);
        totalWeight += weight;

        emit SourceAdded(source, name, weight);
    }

    /**
     * @notice Remove a score source. Adjusts total weight.
     * @param source Address of the source to remove
     */
    function removeSource(address source) external onlyOwner {
        if (!sources[source].registered) revert SourceNotRegistered();

        totalWeight -= sources[source].weight;
        delete sources[source];

        // Remove from sourceList (swap and pop)
        uint256 len = sourceList.length;
        for (uint256 i = 0; i < len; i++) {
            if (sourceList[i] == source) {
                sourceList[i] = sourceList[len - 1];
                sourceList.pop();
                break;
            }
        }

        emit SourceRemoved(source);
    }

    /**
     * @notice Update the weight of an existing source.
     * @param source Address of the source
     * @param weight New weight in basis points
     */
    function setWeight(address source, uint256 weight) external onlyOwner {
        if (!sources[source].registered) revert SourceNotRegistered();
        if (weight == 0) revert ZeroWeight();

        uint256 oldWeight = sources[source].weight;
        totalWeight = totalWeight - oldWeight + weight;
        sources[source].weight = weight;

        emit WeightUpdated(source, oldWeight, weight);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCORE REPORTING (REGISTERED SOURCES ONLY)
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Report a score for a token. Only registered sources can call this.
     * @param tokenId The Exoskeleton token ID
     * @param score The raw score from this source
     */
    function reportScore(uint256 tokenId, uint256 score) external {
        if (!sources[msg.sender].registered) revert SourceNotRegistered();

        sourceScores[msg.sender][tokenId] = score;

        emit ScoreReported(msg.sender, tokenId, score);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RECALCULATION (ANYONE CAN CALL)
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Recalculate the weighted aggregate reputation for a token
     *         and write it to ExoskeletonCore via setExternalScore.
     * @param tokenId The Exoskeleton token ID
     */
    function recalculate(uint256 tokenId) external {
        uint256 len = sourceList.length;
        if (len == 0) revert NoSources();

        uint256 weightedSum = 0;
        uint256 activeWeight = 0;

        for (uint256 i = 0; i < len; i++) {
            address src = sourceList[i];
            uint256 score = sourceScores[src][tokenId];
            uint256 w = sources[src].weight;

            // Only count sources that have reported a score (> 0)
            if (score > 0) {
                weightedSum += score * w;
                activeWeight += w;
            }
        }

        uint256 aggregate = 0;
        if (activeWeight > 0) {
            aggregate = weightedSum / activeWeight;
        }

        reputationScores[tokenId] = aggregate;

        // Write to ExoskeletonCore
        core.setExternalScore(tokenId, scoreKey, int256(aggregate));

        emit ReputationRecalculated(tokenId, aggregate);
    }

    /**
     * @notice Batch recalculate for multiple tokens.
     * @param tokenIds Array of token IDs to recalculate
     */
    function recalculateBatch(uint256[] calldata tokenIds) external {
        uint256 len = sourceList.length;
        if (len == 0) revert NoSources();

        for (uint256 t = 0; t < tokenIds.length; t++) {
            uint256 tokenId = tokenIds[t];
            uint256 weightedSum = 0;
            uint256 activeWeight = 0;

            for (uint256 i = 0; i < len; i++) {
                address src = sourceList[i];
                uint256 score = sourceScores[src][tokenId];
                uint256 w = sources[src].weight;

                if (score > 0) {
                    weightedSum += score * w;
                    activeWeight += w;
                }
            }

            uint256 aggregate = 0;
            if (activeWeight > 0) {
                aggregate = weightedSum / activeWeight;
            }

            reputationScores[tokenId] = aggregate;
            core.setExternalScore(tokenId, scoreKey, int256(aggregate));

            emit ReputationRecalculated(tokenId, aggregate);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Get the cached aggregate reputation for a token.
     * @param tokenId The Exoskeleton token ID
     * @return The weighted aggregate score
     */
    function getReputation(uint256 tokenId) external view returns (uint256) {
        return reputationScores[tokenId];
    }

    /**
     * @notice Get a source's reported score for a token.
     * @param source The source address
     * @param tokenId The Exoskeleton token ID
     * @return The raw score from that source
     */
    function getSourceScore(address source, uint256 tokenId) external view returns (uint256) {
        return sourceScores[source][tokenId];
    }

    /**
     * @notice Get the number of registered sources.
     */
    function getSourceCount() external view returns (uint256) {
        return sourceList.length;
    }

    /**
     * @notice Get all registered source addresses.
     */
    function getSources() external view returns (address[] memory) {
        return sourceList;
    }

    /**
     * @notice Get full details of a source.
     * @param source The source address
     * @return name Source name
     * @return weight Source weight in basis points
     * @return registered Whether the source is registered
     */
    function getSourceInfo(address source) external view returns (
        string memory name,
        uint256 weight,
        bool registered
    ) {
        Source storage s = sources[source];
        return (s.name, s.weight, s.registered);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Update the ExoskeletonCore address.
     */
    function setCore(address _core) external onlyOwner {
        if (_core == address(0)) revert ZeroAddress();
        emit CoreUpdated(address(core), _core);
        core = IExoskeletonCore(_core);
    }

    /**
     * @notice Update the score key used when writing to ExoskeletonCore.
     */
    function setScoreKey(bytes32 _scoreKey) external onlyOwner {
        emit ScoreKeyUpdated(scoreKey, _scoreKey);
        scoreKey = _scoreKey;
    }
}
