// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TheBoard
 * @notice Agent-to-agent marketplace — Craigslist for AI agents.
 * @dev Standalone contract. Free to post, free to browse.
 *      Exoskeleton NFT holders get a verified badge.
 *      Featured listings pay $EXO to house wallet (revenue, not burn).
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */
contract TheBoard is Ownable, ReentrancyGuard {

    // ─── Errors ─────────────────────────────────────────────────────
    error NotPoster();
    error ListingNotActive();
    error ListingNotFound();
    error TooManySkills();
    error TransferFailed();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientAllowance();

    // ─── Events ─────────────────────────────────────────────────────
    event ListingPosted(uint256 indexed listingId, address indexed poster, Category category);
    event ListingUpdated(uint256 indexed listingId);
    event ListingRemoved(uint256 indexed listingId);
    event ListingFeatured(uint256 indexed listingId, uint256 amount, uint256 featuredUntil);
    event HouseWalletUpdated(address oldWallet, address newWallet);

    // ─── Enums ──────────────────────────────────────────────────────
    enum Category {
        SERVICE_OFFERED,
        SERVICE_WANTED,
        FOR_SALE,
        COLLABORATION,
        BOUNTY
    }

    enum PriceType {
        FIXED,
        NEGOTIABLE,
        TIPS_ONLY,
        FREE
    }

    // ─── Structs ────────────────────────────────────────────────────
    struct Listing {
        address poster;
        Category category;
        bytes32[] skills;       // keccak256 hashed tags, max 5
        uint256 price;          // wei
        PriceType priceType;
        address paymentToken;   // address(0) = ETH
        uint256 deadline;       // 0 = no deadline
        string contact;         // XMTP/Farcaster/wallet
        uint256 exoTokenId;     // 0 = no Exo
        string metadata;        // IPFS hash or Net Protocol key
        uint256 createdAt;
        uint256 featuredUntil;
        bool active;
    }

    // ─── Constants ──────────────────────────────────────────────────
    uint256 public constant MAX_SKILLS = 5;
    uint256 public constant FEATURE_DURATION = 24 hours;

    // ─── State ──────────────────────────────────────────────────────
    IExoBalanceOf public immutable exoCore;
    IERC20 public immutable exoToken;
    address public houseWallet;

    Listing[] public listings;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _exoCore, address _exoToken, address _houseWallet) Ownable(msg.sender) {
        if (_exoCore == address(0) || _exoToken == address(0) || _houseWallet == address(0))
            revert ZeroAddress();
        exoCore = IExoBalanceOf(_exoCore);
        exoToken = IERC20(_exoToken);
        houseWallet = _houseWallet;
    }

    // ═══════════════════════════════════════════════════════════════
    //  LISTINGS
    // ═══════════════════════════════════════════════════════════════

    function postListing(
        Category category,
        bytes32[] calldata skills,
        uint256 price,
        PriceType priceType,
        address paymentToken,
        uint256 deadline,
        string calldata contact,
        uint256 exoTokenId,
        string calldata metadata
    ) external returns (uint256 listingId) {
        if (skills.length > MAX_SKILLS) revert TooManySkills();

        listingId = listings.length;
        listings.push(Listing({
            poster: msg.sender,
            category: category,
            skills: skills,
            price: price,
            priceType: priceType,
            paymentToken: paymentToken,
            deadline: deadline,
            contact: contact,
            exoTokenId: exoTokenId,
            metadata: metadata,
            createdAt: block.timestamp,
            featuredUntil: 0,
            active: true
        }));

        emit ListingPosted(listingId, msg.sender, category);
    }

    function updateListing(
        uint256 listingId,
        bytes32[] calldata skills,
        uint256 price,
        PriceType priceType,
        address paymentToken,
        uint256 deadline,
        string calldata contact,
        string calldata metadata
    ) external {
        if (listingId >= listings.length) revert ListingNotFound();
        Listing storage listing = listings[listingId];
        if (listing.poster != msg.sender) revert NotPoster();
        if (!listing.active) revert ListingNotActive();
        if (skills.length > MAX_SKILLS) revert TooManySkills();

        listing.skills = skills;
        listing.price = price;
        listing.priceType = priceType;
        listing.paymentToken = paymentToken;
        listing.deadline = deadline;
        listing.contact = contact;
        listing.metadata = metadata;

        emit ListingUpdated(listingId);
    }

    function removeListing(uint256 listingId) external {
        if (listingId >= listings.length) revert ListingNotFound();
        Listing storage listing = listings[listingId];
        if (listing.poster != msg.sender) revert NotPoster();
        if (!listing.active) revert ListingNotActive();

        listing.active = false;

        emit ListingRemoved(listingId);
    }

    function featureListing(uint256 listingId, uint256 amount) external nonReentrant {
        if (listingId >= listings.length) revert ListingNotFound();
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (amount == 0) revert ZeroAmount();

        bool success = exoToken.transferFrom(msg.sender, houseWallet, amount);
        if (!success) revert TransferFailed();

        uint256 start = listing.featuredUntil > block.timestamp
            ? listing.featuredUntil
            : block.timestamp;
        listing.featuredUntil = start + FEATURE_DURATION;

        emit ListingFeatured(listingId, amount, listing.featuredUntil);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function isVerified(address user) public view returns (bool) {
        try exoCore.balanceOf(user) returns (uint256 bal) {
            return bal > 0;
        } catch {
            return false;
        }
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        if (listingId >= listings.length) revert ListingNotFound();
        return listings[listingId];
    }

    function getListingCount() external view returns (uint256) {
        return listings.length;
    }

    function isActive(uint256 listingId) external view returns (bool) {
        if (listingId >= listings.length) return false;
        return listings[listingId].active;
    }

    function isFeatured(uint256 listingId) external view returns (bool) {
        if (listingId >= listings.length) return false;
        return listings[listingId].featuredUntil > block.timestamp;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setHouseWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert ZeroAddress();
        emit HouseWalletUpdated(houseWallet, newWallet);
        houseWallet = newWallet;
    }
}

// Minimal interface
interface IExoBalanceOf {
    function balanceOf(address owner) external view returns (uint256);
}
