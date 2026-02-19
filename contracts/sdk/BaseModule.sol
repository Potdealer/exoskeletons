// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IExoModule.sol";

/**
 * @title BaseModule — Abstract Base for Exoskeleton Modules
 * @notice Provides common infrastructure for building Exoskeleton modules:
 *         metadata, access control, activation tracking, and lifecycle hooks.
 *
 * @dev Extend this contract to build a module. Override _onActivate() and
 *      _onDeactivate() for custom initialization/cleanup logic.
 *
 *      Access control: onActivate/onDeactivate check that the caller owns
 *      the token via ExoskeletonCore.ownerOf(). This is forward-compatible —
 *      if a future Core upgrade calls modules directly, override the access
 *      check in your subclass.
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */
abstract contract BaseModule is IExoModule {
    // ─── Errors ────────────────────────────────────────────────────
    error NotTokenOwner();
    error AlreadyActive();
    error NotActive();

    // ─── Events ────────────────────────────────────────────────────
    event Activated(uint256 indexed tokenId, uint256 timestamp);
    event Deactivated(uint256 indexed tokenId, uint256 timestamp);

    // ─── Immutable State ───────────────────────────────────────────
    string private _name;
    string private _version;
    string private _description;
    address private immutable _builder;
    bytes32 private immutable _moduleKey;
    address public immutable exoskeletonCore;

    // ─── Activation Tracking ───────────────────────────────────────
    mapping(uint256 => bool) private _activeTokens;
    mapping(uint256 => uint256) public activatedAt;
    uint256 public totalActivations;

    // ─── Constructor ───────────────────────────────────────────────

    constructor(
        string memory name_,
        string memory version_,
        string memory description_,
        address core_
    ) {
        require(core_ != address(0), "BaseModule: zero core address");
        _name = name_;
        _version = version_;
        _description = description_;
        _builder = msg.sender;
        _moduleKey = keccak256(abi.encodePacked(name_));
        exoskeletonCore = core_;
    }

    // ─── IExoModule: Metadata ──────────────────────────────────────

    function moduleName() external view override returns (string memory) {
        return _name;
    }

    function moduleVersion() external view override returns (string memory) {
        return _version;
    }

    function moduleDescription() external view override returns (string memory) {
        return _description;
    }

    function builder() external view override returns (address) {
        return _builder;
    }

    function moduleKey() external view override returns (bytes32) {
        return _moduleKey;
    }

    // ─── IExoModule: Identity ──────────────────────────────────────

    function isExoModule() external pure override returns (bool) {
        return true;
    }

    // ─── IExoModule: Lifecycle ─────────────────────────────────────

    function onActivate(uint256 tokenId) external virtual override {
        _checkTokenOwner(tokenId);
        if (_activeTokens[tokenId]) revert AlreadyActive();

        _activeTokens[tokenId] = true;
        activatedAt[tokenId] = block.timestamp;
        totalActivations++;

        emit Activated(tokenId, block.timestamp);
        _onActivate(tokenId);
    }

    function onDeactivate(uint256 tokenId) external virtual override {
        _checkTokenOwner(tokenId);
        if (!_activeTokens[tokenId]) revert NotActive();

        _activeTokens[tokenId] = false;

        emit Deactivated(tokenId, block.timestamp);
        _onDeactivate(tokenId);
    }

    // ─── IExoModule: Status ────────────────────────────────────────

    function isActiveFor(uint256 tokenId) external view override returns (bool) {
        return _activeTokens[tokenId];
    }

    // ─── Hooks for Subclasses ──────────────────────────────────────

    /// @dev Override to add custom logic when a token activates this module
    function _onActivate(uint256 tokenId) internal virtual {}

    /// @dev Override to add custom logic when a token deactivates this module
    function _onDeactivate(uint256 tokenId) internal virtual {}

    // ─── Internal Helpers ──────────────────────────────────────────

    /// @dev Checks that msg.sender owns the given token on ExoskeletonCore
    function _checkTokenOwner(uint256 tokenId) internal view {
        // Use low-level staticcall to avoid importing full ERC-721 interface
        (bool success, bytes memory data) = exoskeletonCore.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", tokenId)
        );
        require(success && data.length >= 32, "BaseModule: ownerOf failed");
        address tokenOwner = abi.decode(data, (address));
        if (tokenOwner != msg.sender) revert NotTokenOwner();
    }

    /// @dev Modifier: requires the token to be active on this module
    modifier onlyActive(uint256 tokenId) {
        if (!_activeTokens[tokenId]) revert NotActive();
        _;
    }

    /// @dev Modifier: requires the caller to own the token
    modifier onlyTokenOwner(uint256 tokenId) {
        _checkTokenOwner(tokenId);
        _;
    }
}
