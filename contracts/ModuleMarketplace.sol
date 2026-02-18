// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ModuleMarketplace
 * @notice Curated marketplace for Exoskeleton modules.
 * @dev Standalone contract — does NOT modify ExoskeletonCore. Uses ownerOf()
 *      for token ownership checks. Builders submit modules, owner approves,
 *      token holders activate. Payment split: 95.80% builder / 4.20% platform.
 *
 *      Marketplace modules are a separate layer from core module slots.
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */
contract ModuleMarketplace is Ownable, ReentrancyGuard {
    // ─── Errors ─────────────────────────────────────────────────────
    error ZeroAddress();
    error NotTokenOwner();
    error BuilderNotRegistered();
    error BuilderAlreadyRegistered();
    error ModuleAlreadyExists();
    error ModuleNotFound();
    error ModuleNotApproved();
    error ModuleAlreadyActive();
    error ModuleNotActive();
    error ModulePending();
    error ModuleNotPending();
    error ModuleNotDelisted();
    error NotModuleBuilder();
    error PriceExceedsMax();
    error InsufficientPayment();
    error TransferFailed();
    error NameTooLong();
    error EmptyName();

    // ─── Events ─────────────────────────────────────────────────────
    event BuilderRegistered(address indexed builder, string name);
    event BuilderUpdated(address indexed builder);
    event ModuleSubmitted(bytes32 indexed moduleName, address indexed builder, uint256 price);
    event ModuleApproved(bytes32 indexed moduleName);
    event ModuleRejected(bytes32 indexed moduleName, string reason);
    event ModuleDelisted(bytes32 indexed moduleName, address indexed by);
    event ModuleRelisted(bytes32 indexed moduleName);
    event ModuleActivated(bytes32 indexed moduleName, uint256 indexed tokenId, address indexed activator);
    event ModuleDeactivated(bytes32 indexed moduleName, uint256 indexed tokenId);
    event ModulePriceUpdated(bytes32 indexed moduleName, uint256 oldPrice, uint256 newPrice);
    event ModuleDescriptionUpdated(bytes32 indexed moduleName);
    event ModuleVersionUpdated(bytes32 indexed moduleName, string newVersion);
    event ListingFeesWithdrawn(address indexed to, uint256 amount);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    // ─── Constants ──────────────────────────────────────────────────
    uint256 public constant PLATFORM_FEE_BPS = 420; // 4.20%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant LISTING_FEE = 0.001 ether;
    uint256 public constant MAX_PRICE = 10 ether;
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_DESC_LENGTH = 512;
    uint256 public constant MAX_VERSION_LENGTH = 32;

    // ─── Interfaces ─────────────────────────────────────────────────

    /// @dev Minimal interface — only need ownerOf from ExoskeletonCore.
    IERC721Minimal public immutable core;

    // ─── Enums ──────────────────────────────────────────────────────

    enum ModuleStatus {
        NONE,
        PENDING,
        APPROVED,
        REJECTED,
        DELISTED
    }

    // ─── Structs ────────────────────────────────────────────────────

    struct Builder {
        string name;
        string bio;
        uint256 modulesSubmitted;
        uint256 totalEarnings;
        bool registered;
    }

    struct Module {
        address builder;
        string name;
        string description;
        string version;
        uint256 price;          // 0 = free
        ModuleStatus status;
        uint256 submittedAt;
        uint256 approvedAt;
        uint256 totalActivations;
        uint256 totalRevenue;
    }

    struct Activation {
        bool active;
        uint256 activatedAt;
    }

    // ─── State ──────────────────────────────────────────────────────

    address public platformTreasury;
    uint256 public accumulatedListingFees;

    // Builder profiles
    mapping(address => Builder) public builders;

    // Module registry
    mapping(bytes32 => Module) public modules;
    bytes32[] public allModuleNames;

    // Per-builder module list
    mapping(address => bytes32[]) public builderModules;

    // Activation tracking: tokenId => moduleName => Activation
    mapping(uint256 => mapping(bytes32 => Activation)) public activations;

    // Per-token active module list
    mapping(uint256 => bytes32[]) internal _tokenActiveModules;

    // Pending queue
    bytes32[] public pendingQueue;

    // Global stats
    uint256 public totalModules;
    uint256 public totalApproved;
    uint256 public totalActivations;
    uint256 public totalPlatformRevenue;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _core, address _treasury) Ownable(msg.sender) {
        if (_core == address(0) || _treasury == address(0)) revert ZeroAddress();
        core = IERC721Minimal(_core);
        platformTreasury = _treasury;
    }

    // ═══════════════════════════════════════════════════════════════
    //  BUILDER REGISTRATION
    // ═══════════════════════════════════════════════════════════════

    function registerBuilder(string calldata _name, string calldata _bio) external {
        if (builders[msg.sender].registered) revert BuilderAlreadyRegistered();
        if (bytes(_name).length == 0) revert EmptyName();
        if (bytes(_name).length > MAX_NAME_LENGTH) revert NameTooLong();

        builders[msg.sender] = Builder({
            name: _name,
            bio: _bio,
            modulesSubmitted: 0,
            totalEarnings: 0,
            registered: true
        });

        emit BuilderRegistered(msg.sender, _name);
    }

    function updateBuilderProfile(string calldata _name, string calldata _bio) external {
        if (!builders[msg.sender].registered) revert BuilderNotRegistered();
        if (bytes(_name).length == 0) revert EmptyName();
        if (bytes(_name).length > MAX_NAME_LENGTH) revert NameTooLong();

        builders[msg.sender].name = _name;
        builders[msg.sender].bio = _bio;

        emit BuilderUpdated(msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MODULE SUBMISSION
    // ═══════════════════════════════════════════════════════════════

    function submitModule(
        bytes32 moduleName,
        string calldata _name,
        string calldata _description,
        string calldata _version,
        uint256 _price
    ) external payable {
        if (!builders[msg.sender].registered) revert BuilderNotRegistered();
        if (modules[moduleName].status != ModuleStatus.NONE) revert ModuleAlreadyExists();
        if (msg.value < LISTING_FEE) revert InsufficientPayment();
        if (_price > MAX_PRICE) revert PriceExceedsMax();
        if (bytes(_name).length == 0) revert EmptyName();
        if (bytes(_name).length > MAX_NAME_LENGTH) revert NameTooLong();

        modules[moduleName] = Module({
            builder: msg.sender,
            name: _name,
            description: _description,
            version: _version,
            price: _price,
            status: ModuleStatus.PENDING,
            submittedAt: block.timestamp,
            approvedAt: 0,
            totalActivations: 0,
            totalRevenue: 0
        });

        allModuleNames.push(moduleName);
        builderModules[msg.sender].push(moduleName);
        pendingQueue.push(moduleName);
        builders[msg.sender].modulesSubmitted++;
        totalModules++;
        accumulatedListingFees += LISTING_FEE;

        // Refund overpayment
        if (msg.value > LISTING_FEE) {
            (bool refunded,) = msg.sender.call{value: msg.value - LISTING_FEE}("");
            if (!refunded) revert TransferFailed();
        }

        emit ModuleSubmitted(moduleName, msg.sender, _price);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MODULE CURATION (OWNER)
    // ═══════════════════════════════════════════════════════════════

    function approveModule(bytes32 moduleName) external onlyOwner {
        Module storage mod = modules[moduleName];
        if (mod.status != ModuleStatus.PENDING) revert ModuleNotPending();

        mod.status = ModuleStatus.APPROVED;
        mod.approvedAt = block.timestamp;
        totalApproved++;

        _removePending(moduleName);

        emit ModuleApproved(moduleName);
    }

    function rejectModule(bytes32 moduleName, string calldata reason) external onlyOwner {
        Module storage mod = modules[moduleName];
        if (mod.status != ModuleStatus.PENDING) revert ModuleNotPending();

        mod.status = ModuleStatus.REJECTED;

        _removePending(moduleName);

        emit ModuleRejected(moduleName, reason);
    }

    function delistModule(bytes32 moduleName) external onlyOwner {
        Module storage mod = modules[moduleName];
        if (mod.status != ModuleStatus.APPROVED) revert ModuleNotApproved();

        mod.status = ModuleStatus.DELISTED;
        totalApproved--;

        emit ModuleDelisted(moduleName, msg.sender);
    }

    function relistModule(bytes32 moduleName) external onlyOwner {
        Module storage mod = modules[moduleName];
        if (mod.status != ModuleStatus.DELISTED) revert ModuleNotDelisted();

        mod.status = ModuleStatus.APPROVED;
        mod.approvedAt = block.timestamp;
        totalApproved++;

        emit ModuleRelisted(moduleName);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BUILDER SELF-DELIST
    // ═══════════════════════════════════════════════════════════════

    function builderDelistModule(bytes32 moduleName) external {
        Module storage mod = modules[moduleName];
        if (mod.builder != msg.sender) revert NotModuleBuilder();
        if (mod.status != ModuleStatus.APPROVED) revert ModuleNotApproved();

        mod.status = ModuleStatus.DELISTED;
        totalApproved--;

        emit ModuleDelisted(moduleName, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ACTIVATION / DEACTIVATION
    // ═══════════════════════════════════════════════════════════════

    function activateModule(uint256 tokenId, bytes32 moduleName) external payable nonReentrant {
        // Check token ownership via ExoskeletonCore
        if (core.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        Module storage mod = modules[moduleName];
        if (mod.status != ModuleStatus.APPROVED) revert ModuleNotApproved();
        if (activations[tokenId][moduleName].active) revert ModuleAlreadyActive();

        uint256 price = mod.price;

        if (price > 0) {
            if (msg.value < price) revert InsufficientPayment();
        }

        // Effects first (checks-effects-interactions)
        activations[tokenId][moduleName] = Activation({
            active: true,
            activatedAt: block.timestamp
        });
        _tokenActiveModules[tokenId].push(moduleName);

        mod.totalActivations++;
        totalActivations++;

        // Interactions: split payment
        if (price > 0) {
            uint256 platformFee = (price * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 builderPayout = price - platformFee;

            mod.totalRevenue += price;
            builders[mod.builder].totalEarnings += builderPayout;
            totalPlatformRevenue += platformFee;

            // Pay builder
            (bool builderSent,) = mod.builder.call{value: builderPayout}("");
            if (!builderSent) revert TransferFailed();

            // Pay platform
            (bool platformSent,) = platformTreasury.call{value: platformFee}("");
            if (!platformSent) revert TransferFailed();

            // Refund overpayment
            uint256 excess = msg.value - price;
            if (excess > 0) {
                (bool refunded,) = msg.sender.call{value: excess}("");
                if (!refunded) revert TransferFailed();
            }
        } else if (msg.value > 0) {
            // Free module but ETH sent — refund
            (bool refunded,) = msg.sender.call{value: msg.value}("");
            if (!refunded) revert TransferFailed();
        }

        emit ModuleActivated(moduleName, tokenId, msg.sender);
    }

    function deactivateModule(uint256 tokenId, bytes32 moduleName) external {
        if (core.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (!activations[tokenId][moduleName].active) revert ModuleNotActive();

        activations[tokenId][moduleName].active = false;

        // Remove from token's active list
        bytes32[] storage activeList = _tokenActiveModules[tokenId];
        for (uint256 i = 0; i < activeList.length; i++) {
            if (activeList[i] == moduleName) {
                activeList[i] = activeList[activeList.length - 1];
                activeList.pop();
                break;
            }
        }

        emit ModuleDeactivated(moduleName, tokenId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BUILDER UPDATES
    // ═══════════════════════════════════════════════════════════════

    function updateModulePrice(bytes32 moduleName, uint256 newPrice) external {
        Module storage mod = modules[moduleName];
        if (mod.builder != msg.sender) revert NotModuleBuilder();
        if (newPrice > MAX_PRICE) revert PriceExceedsMax();

        uint256 oldPrice = mod.price;
        mod.price = newPrice;

        emit ModulePriceUpdated(moduleName, oldPrice, newPrice);
    }

    function updateModuleDescription(bytes32 moduleName, string calldata newDescription) external {
        Module storage mod = modules[moduleName];
        if (mod.builder != msg.sender) revert NotModuleBuilder();

        mod.description = newDescription;

        emit ModuleDescriptionUpdated(moduleName);
    }

    function updateModuleVersion(bytes32 moduleName, string calldata newVersion) external {
        Module storage mod = modules[moduleName];
        if (mod.builder != msg.sender) revert NotModuleBuilder();

        mod.version = newVersion;

        emit ModuleVersionUpdated(moduleName, newVersion);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function withdrawListingFees() external onlyOwner {
        uint256 amount = accumulatedListingFees;
        if (amount == 0) return;

        accumulatedListingFees = 0;

        (bool sent,) = platformTreasury.call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit ListingFeesWithdrawn(platformTreasury, amount);
    }

    function setPlatformTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        emit TreasuryUpdated(platformTreasury, newTreasury);
        platformTreasury = newTreasury;
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function getModule(bytes32 moduleName) external view returns (
        address builder,
        string memory name,
        string memory description,
        string memory version,
        uint256 price,
        ModuleStatus status,
        uint256 submittedAt,
        uint256 approvedAt,
        uint256 moduleActivations,
        uint256 moduleRevenue
    ) {
        Module storage mod = modules[moduleName];
        return (
            mod.builder,
            mod.name,
            mod.description,
            mod.version,
            mod.price,
            mod.status,
            mod.submittedAt,
            mod.approvedAt,
            mod.totalActivations,
            mod.totalRevenue
        );
    }

    function getBuilder(address builderAddr) external view returns (
        string memory name,
        string memory bio,
        uint256 modulesSubmitted,
        uint256 totalEarnings,
        bool registered
    ) {
        Builder storage b = builders[builderAddr];
        return (b.name, b.bio, b.modulesSubmitted, b.totalEarnings, b.registered);
    }

    function isModuleActive(uint256 tokenId, bytes32 moduleName) external view returns (bool) {
        return activations[tokenId][moduleName].active;
    }

    function getActivation(uint256 tokenId, bytes32 moduleName) external view returns (
        bool active,
        uint256 activatedAt
    ) {
        Activation storage a = activations[tokenId][moduleName];
        return (a.active, a.activatedAt);
    }

    function getTokenActiveModules(uint256 tokenId) external view returns (bytes32[] memory) {
        return _tokenActiveModules[tokenId];
    }

    function getBuilderModules(address builderAddr) external view returns (bytes32[] memory) {
        return builderModules[builderAddr];
    }

    function getAllModuleNames() external view returns (bytes32[] memory) {
        return allModuleNames;
    }

    function getPendingQueue() external view returns (bytes32[] memory) {
        return pendingQueue;
    }

    function getModuleCount() external view returns (uint256) {
        return allModuleNames.length;
    }

    function getPendingCount() external view returns (uint256) {
        return pendingQueue.length;
    }

    function getStats() external view returns (
        uint256 _totalModules,
        uint256 _totalApproved,
        uint256 _totalActivations,
        uint256 _totalPlatformRevenue,
        uint256 _pendingCount,
        uint256 _listingFees
    ) {
        return (
            totalModules,
            totalApproved,
            totalActivations,
            totalPlatformRevenue,
            pendingQueue.length,
            accumulatedListingFees
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _removePending(bytes32 moduleName) internal {
        uint256 len = pendingQueue.length;
        for (uint256 i = 0; i < len; i++) {
            if (pendingQueue[i] == moduleName) {
                pendingQueue[i] = pendingQueue[len - 1];
                pendingQueue.pop();
                return;
            }
        }
    }
}

// ─── Minimal Interface ──────────────────────────────────────────

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
}
