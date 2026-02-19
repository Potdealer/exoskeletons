// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../BaseModule.sol";

/**
 * @title StorageModule — Token-Bound Key-Value Storage
 * @notice Extends an Exoskeleton's storage capacity with permissioned
 *         key-value slots. Token owners can store data and grant write
 *         access to other addresses (agents, contracts, collaborators).
 *
 * @dev Use cases:
 *   - Agent persistent memory (strategies, learned preferences)
 *   - Configuration data for other modules
 *   - Shared knowledge bases (multiple writers, one token)
 *   - Agent context that survives ownership transfer
 *
 *      Data is token-bound: it belongs to the Exoskeleton, not the owner.
 *      When the token transfers, the data stays with it.
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */
contract StorageModule is BaseModule {
    // ─── Errors ────────────────────────────────────────────────────
    error NotWriter();
    error KeyEmpty();
    error ValueTooLarge();

    // ─── Events ────────────────────────────────────────────────────
    event DataWritten(uint256 indexed tokenId, bytes32 indexed key, address writer);
    event DataDeleted(uint256 indexed tokenId, bytes32 indexed key);
    event WriterGranted(uint256 indexed tokenId, address indexed writer);
    event WriterRevoked(uint256 indexed tokenId, address indexed writer);

    // ─── Constants ─────────────────────────────────────────────────
    uint256 public constant MAX_VALUE_SIZE = 1024; // 1KB per slot

    // ─── Storage ───────────────────────────────────────────────────

    /// @dev tokenId => key => value
    mapping(uint256 => mapping(bytes32 => bytes)) private _data;

    /// @dev tokenId => key[] (for enumeration)
    mapping(uint256 => bytes32[]) private _keys;
    mapping(uint256 => mapping(bytes32 => bool)) private _keyExists;

    /// @dev tokenId => writer address => authorized
    mapping(uint256 => mapping(address => bool)) public writers;

    /// @dev tokenId => total storage writes
    mapping(uint256 => uint256) public writeCount;

    // ─── Constructor ───────────────────────────────────────────────

    constructor(address core_) BaseModule(
        "storage-vault",
        "1.0.0",
        "Token-bound key-value storage with permissioned writers",
        core_
    ) {}

    // ─── Write Operations ──────────────────────────────────────────

    /// @notice Store a value under a key for a token
    /// @param tokenId The exoskeleton token
    /// @param key The storage key (bytes32)
    /// @param value The data to store
    function write(uint256 tokenId, bytes32 key, bytes calldata value)
        external
        onlyActive(tokenId)
    {
        _checkWriter(tokenId);
        if (key == bytes32(0)) revert KeyEmpty();
        if (value.length > MAX_VALUE_SIZE) revert ValueTooLarge();

        _data[tokenId][key] = value;
        writeCount[tokenId]++;

        if (!_keyExists[tokenId][key]) {
            _keys[tokenId].push(key);
            _keyExists[tokenId][key] = true;
        }

        emit DataWritten(tokenId, key, msg.sender);
    }

    /// @notice Delete a key's data
    function deleteKey(uint256 tokenId, bytes32 key)
        external
        onlyActive(tokenId)
        onlyTokenOwner(tokenId)
    {
        delete _data[tokenId][key];
        emit DataDeleted(tokenId, key);
    }

    // ─── Read Operations ───────────────────────────────────────────

    /// @notice Read a value (public — anyone can read)
    function read(uint256 tokenId, bytes32 key) external view returns (bytes memory) {
        return _data[tokenId][key];
    }

    /// @notice Get all keys for a token
    function getKeys(uint256 tokenId) external view returns (bytes32[] memory) {
        return _keys[tokenId];
    }

    /// @notice Get number of keys stored
    function keyCount(uint256 tokenId) external view returns (uint256) {
        return _keys[tokenId].length;
    }

    // ─── Writer Permissions ────────────────────────────────────────

    /// @notice Grant write access to an address
    function grantWriter(uint256 tokenId, address writer)
        external
        onlyActive(tokenId)
        onlyTokenOwner(tokenId)
    {
        writers[tokenId][writer] = true;
        emit WriterGranted(tokenId, writer);
    }

    /// @notice Revoke write access
    function revokeWriter(uint256 tokenId, address writer)
        external
        onlyActive(tokenId)
        onlyTokenOwner(tokenId)
    {
        writers[tokenId][writer] = false;
        emit WriterRevoked(tokenId, writer);
    }

    /// @notice Check if an address can write to a token's storage
    function canWrite(uint256 tokenId, address addr) external view returns (bool) {
        return _isWriter(tokenId, addr);
    }

    // ─── Internal ──────────────────────────────────────────────────

    function _checkWriter(uint256 tokenId) internal view {
        if (!_isWriter(tokenId, msg.sender)) revert NotWriter();
    }

    function _isWriter(uint256 tokenId, address addr) internal view returns (bool) {
        // Token owner is always a writer
        (bool success, bytes memory data) = exoskeletonCore.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", tokenId)
        );
        if (success && data.length >= 32) {
            address tokenOwner = abi.decode(data, (address));
            if (addr == tokenOwner) return true;
        }
        // Check granted writers
        return writers[tokenId][addr];
    }
}
