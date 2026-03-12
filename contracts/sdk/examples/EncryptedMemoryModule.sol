// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../BaseModule.sol";

/**
 * @title EncryptedMemoryModule — Token-Bound Encrypted Agent Memory
 * @notice Stores encrypted agent memory, training data, configs, and backups
 *         on-chain, bound to an Exoskeleton token. Data travels with the token
 *         on transfer — the NFT IS the agent's persistent brain.
 *
 * @dev Architecture:
 *   - Small data (<= MAX_INLINE_SIZE) stored directly in contract storage
 *   - Large data stored off-chain (Net Protocol / IPFS) with content hash on-chain
 *   - All data encrypted client-side (AES-256-GCM recommended) before storage
 *   - Slot system with standardized names for interoperability:
 *       "identity"  — personality, CLAUDE.md, SOUL.md
 *       "memory"    — persistent memory, learned patterns
 *       "config"    — API keys, .env references (encrypted)
 *       "training"  — conversation logs, corrections, lessons
 *       "strategy"  — game configs, trading parameters
 *       "backup"    — full encrypted snapshots
 *
 *      Encryption is handled off-chain. The contract stores opaque bytes.
 *      Anyone can read the ciphertext; only the key holder can decrypt.
 *      On token transfer, new owner needs the decryption key from the
 *      previous owner to access the data — or they can overwrite it.
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */
contract EncryptedMemoryModule is BaseModule {
    // ─── Errors ────────────────────────────────────────────────────
    error NotWriter();
    error SlotNameEmpty();
    error DataTooLarge();
    error ContentHashRequired();
    error SlotNotFound();

    // ─── Events ────────────────────────────────────────────────────
    event MemoryStored(
        uint256 indexed tokenId,
        bytes32 indexed slot,
        uint32 version,
        bool isInline,
        address writer
    );
    event MemoryUpdated(
        uint256 indexed tokenId,
        bytes32 indexed slot,
        uint32 version,
        bool isInline,
        address writer
    );
    event MemoryDeleted(uint256 indexed tokenId, bytes32 indexed slot);
    event WriterGranted(uint256 indexed tokenId, address indexed writer);
    event WriterRevoked(uint256 indexed tokenId, address indexed writer);

    // ─── Constants ─────────────────────────────────────────────────
    uint256 public constant MAX_INLINE_SIZE = 4096;    // 4KB inline limit
    uint256 public constant MAX_URI_LENGTH = 256;      // storage URI max length

    // ─── Structs ───────────────────────────────────────────────────

    struct MemoryEntry {
        bytes32 contentHash;     // keccak256 of encrypted data (for verification)
        string storageURI;       // Net Protocol key, IPFS CID, or empty for inline
        bytes inlineData;        // encrypted data stored directly (if small enough)
        uint64 size;             // size of encrypted data in bytes
        uint64 timestamp;        // last write time
        uint32 version;          // increments on each update
        bool exists;
    }

    // ─── Storage ───────────────────────────────────────────────────

    /// @dev tokenId => slot => MemoryEntry
    mapping(uint256 => mapping(bytes32 => MemoryEntry)) private _entries;

    /// @dev tokenId => slot[] (for enumeration)
    mapping(uint256 => bytes32[]) private _slots;
    mapping(uint256 => mapping(bytes32 => bool)) private _slotExists;

    /// @dev tokenId => writer address => authorized
    mapping(uint256 => mapping(address => bool)) public writers;

    /// @dev tokenId => total writes
    mapping(uint256 => uint256) public writeCount;

    // ─── Constructor ───────────────────────────────────────────────

    constructor(address core_) BaseModule(
        "encrypted-memory",
        "1.0.0",
        "Token-bound encrypted agent memory, training, and backup storage",
        core_
    ) {}

    // ─── Write: Inline (small data stored on-chain) ────────────────

    /// @notice Store encrypted data directly on-chain
    /// @param tokenId The exoskeleton token
    /// @param slot The memory slot name (e.g., keccak256("identity"))
    /// @param encryptedData The encrypted bytes to store
    function storeInline(
        uint256 tokenId,
        bytes32 slot,
        bytes calldata encryptedData
    ) external onlyActive(tokenId) {
        _checkWriter(tokenId);
        if (slot == bytes32(0)) revert SlotNameEmpty();
        if (encryptedData.length > MAX_INLINE_SIZE) revert DataTooLarge();

        MemoryEntry storage entry = _entries[tokenId][slot];
        bool isNew = !entry.exists;

        entry.contentHash = keccak256(encryptedData);
        entry.storageURI = "";
        entry.inlineData = encryptedData;
        entry.size = uint64(encryptedData.length);
        entry.timestamp = uint64(block.timestamp);
        entry.version++;
        entry.exists = true;

        writeCount[tokenId]++;

        if (isNew) {
            _slots[tokenId].push(slot);
            _slotExists[tokenId][slot] = true;
            emit MemoryStored(tokenId, slot, entry.version, true, msg.sender);
        } else {
            emit MemoryUpdated(tokenId, slot, entry.version, true, msg.sender);
        }
    }

    // ─── Write: External Reference (large data stored off-chain) ───

    /// @notice Store a reference to encrypted data hosted off-chain
    /// @param tokenId The exoskeleton token
    /// @param slot The memory slot name
    /// @param contentHash keccak256 of the encrypted data (for verification)
    /// @param storageURI The off-chain location (Net Protocol key, IPFS CID, URL)
    /// @param size Size of the encrypted data in bytes
    function storeExternal(
        uint256 tokenId,
        bytes32 slot,
        bytes32 contentHash,
        string calldata storageURI,
        uint64 size
    ) external onlyActive(tokenId) {
        _checkWriter(tokenId);
        if (slot == bytes32(0)) revert SlotNameEmpty();
        if (contentHash == bytes32(0)) revert ContentHashRequired();
        if (bytes(storageURI).length > MAX_URI_LENGTH) revert DataTooLarge();

        MemoryEntry storage entry = _entries[tokenId][slot];
        bool isNew = !entry.exists;

        entry.contentHash = contentHash;
        entry.storageURI = storageURI;
        entry.inlineData = "";
        entry.size = size;
        entry.timestamp = uint64(block.timestamp);
        entry.version++;
        entry.exists = true;

        writeCount[tokenId]++;

        if (isNew) {
            _slots[tokenId].push(slot);
            _slotExists[tokenId][slot] = true;
            emit MemoryStored(tokenId, slot, entry.version, false, msg.sender);
        } else {
            emit MemoryUpdated(tokenId, slot, entry.version, false, msg.sender);
        }
    }

    // ─── Delete ────────────────────────────────────────────────────

    /// @notice Delete a memory slot (owner only)
    function deleteSlot(uint256 tokenId, bytes32 slot)
        external
        onlyActive(tokenId)
        onlyTokenOwner(tokenId)
    {
        if (!_entries[tokenId][slot].exists) revert SlotNotFound();
        delete _entries[tokenId][slot];
        emit MemoryDeleted(tokenId, slot);
    }

    // ─── Read Operations ───────────────────────────────────────────

    /// @notice Read inline encrypted data for a slot
    function readInline(uint256 tokenId, bytes32 slot)
        external view returns (bytes memory)
    {
        return _entries[tokenId][slot].inlineData;
    }

    /// @notice Get full metadata for a memory slot
    function getEntry(uint256 tokenId, bytes32 slot)
        external view returns (
            bytes32 contentHash,
            string memory storageURI,
            uint64 size,
            uint64 timestamp,
            uint32 version,
            bool exists,
            bool isInline
        )
    {
        MemoryEntry storage entry = _entries[tokenId][slot];
        return (
            entry.contentHash,
            entry.storageURI,
            entry.size,
            entry.timestamp,
            entry.version,
            entry.exists,
            bytes(entry.storageURI).length == 0 && entry.exists
        );
    }

    /// @notice Get all slot names for a token
    function getSlots(uint256 tokenId)
        external view returns (bytes32[] memory)
    {
        return _slots[tokenId];
    }

    /// @notice Get number of slots used
    function slotCount(uint256 tokenId)
        external view returns (uint256)
    {
        return _slots[tokenId].length;
    }

    /// @notice Check if a slot exists
    function hasSlot(uint256 tokenId, bytes32 slot)
        external view returns (bool)
    {
        return _entries[tokenId][slot].exists;
    }

    /// @notice Verify data integrity against stored content hash
    function verifyContent(uint256 tokenId, bytes32 slot, bytes calldata data)
        external view returns (bool)
    {
        return _entries[tokenId][slot].contentHash == keccak256(data);
    }

    // ─── Writer Permissions ────────────────────────────────────────

    /// @notice Grant write access (e.g., to the TBA so the agent can write its own memory)
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

    /// @notice Check if an address can write to a token's memory
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
        // Check granted writers (e.g., the TBA)
        return writers[tokenId][addr];
    }
}
