// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ExoskeletonWallet
 * @notice Helper for activating ERC-6551 Token Bound Accounts on Exoskeletons.
 *         Each Exoskeleton can optionally have its own wallet (TBA) that holds tokens,
 *         NFTs, and executes onchain actions.
 *
 * @dev Uses the canonical ERC-6551 Registry deployed at
 *      0x000000006551c19487814612e58FE06813775758 on Base.
 *      The TBA implementation must be deployed separately.
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */

interface IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}

interface IExoskeletonCore {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract ExoskeletonWallet is Ownable {

    // ─── Errors ─────────────────────────────────────────────────────
    error ZeroAddress();
    error NotTokenOwner();
    error WalletAlreadyActivated();
    error ImplementationNotSet();

    // ─── Events ─────────────────────────────────────────────────────
    event WalletActivated(uint256 indexed tokenId, address indexed wallet);
    event ImplementationUpdated(address oldImpl, address newImpl);
    event CoreUpdated(address oldCore, address newCore);

    // ─── Constants ──────────────────────────────────────────────────
    // Canonical ERC-6551 Registry on all EVM chains
    IERC6551Registry public constant REGISTRY =
        IERC6551Registry(0x000000006551c19487814612e58FE06813775758);

    // ─── State ──────────────────────────────────────────────────────
    IExoskeletonCore public core;
    address public tbaImplementation; // ERC-6551 account implementation
    uint256 public chainId;

    // Tracking which tokens have activated wallets
    mapping(uint256 => address) public tokenWallet;
    mapping(uint256 => bool) public walletActive;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(
        address _core,
        address _tbaImplementation,
        uint256 _chainId
    ) Ownable(msg.sender) {
        if (_core == address(0)) revert ZeroAddress();
        core = IExoskeletonCore(_core);
        tbaImplementation = _tbaImplementation;
        chainId = _chainId;
    }

    // ═══════════════════════════════════════════════════════════════
    //  WALLET ACTIVATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Activate a Token Bound Account for an Exoskeleton
     * @param tokenId The token to activate a wallet for
     * @return wallet The address of the created TBA
     */
    function activateWallet(uint256 tokenId) external returns (address wallet) {
        if (core.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (walletActive[tokenId]) revert WalletAlreadyActivated();
        if (tbaImplementation == address(0)) revert ImplementationNotSet();

        wallet = REGISTRY.createAccount(
            tbaImplementation,
            bytes32(0), // default salt
            chainId,
            address(core),
            tokenId
        );

        tokenWallet[tokenId] = wallet;
        walletActive[tokenId] = true;

        emit WalletActivated(tokenId, wallet);
    }

    /**
     * @notice Get the deterministic wallet address for a token (even before activation)
     * @param tokenId The token to query
     * @return wallet The predicted TBA address
     */
    function getWalletAddress(uint256 tokenId) external view returns (address) {
        if (tbaImplementation == address(0)) revert ImplementationNotSet();
        return REGISTRY.account(
            tbaImplementation,
            bytes32(0),
            chainId,
            address(core),
            tokenId
        );
    }

    /**
     * @notice Check if a token has an activated wallet
     */
    function hasWallet(uint256 tokenId) external view returns (bool) {
        return walletActive[tokenId];
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setImplementation(address _impl) external onlyOwner {
        emit ImplementationUpdated(tbaImplementation, _impl);
        tbaImplementation = _impl;
    }

    function setCoreContract(address _core) external onlyOwner {
        if (_core == address(0)) revert ZeroAddress();
        emit CoreUpdated(address(core), _core);
        core = IExoskeletonCore(_core);
    }
}
