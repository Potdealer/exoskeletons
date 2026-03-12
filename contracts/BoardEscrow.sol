// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BoardEscrow
 * @notice Escrow contract for TheBoard marketplace.
 * @dev Simple timeout escrow with owner arbitration for disputes.
 *      Supports ETH and ERC20 payments. Writes reputation to ExoskeletonCore.
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */
contract BoardEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Errors ─────────────────────────────────────────────────────
    error ZeroAddress();
    error ZeroAmount();
    error NotBuyer();
    error NotWorker();
    error InvalidState();
    error TimeoutNotReached();
    error TransferFailed();
    error ListingNotActive();

    // ─── Events ─────────────────────────────────────────────────────
    event EscrowCreated(uint256 indexed escrowId, uint256 indexed listingId, address indexed buyer, address worker, uint256 amount);
    event EscrowAccepted(uint256 indexed escrowId);
    event DeliverableSubmitted(uint256 indexed escrowId, bytes deliverable);
    event DeliveryConfirmed(uint256 indexed escrowId);
    event DeliveryDisputed(uint256 indexed escrowId);
    event DisputeResolved(uint256 indexed escrowId, bool toWorker);
    event EscrowCancelled(uint256 indexed escrowId);
    event TimeoutClaimed(uint256 indexed escrowId);
    event TipSent(address indexed from, address indexed to, uint256 amount);
    event HouseWalletUpdated(address oldWallet, address newWallet);

    // ─── Enums ──────────────────────────────────────────────────────
    enum EscrowStatus {
        CREATED,
        ACCEPTED,
        DELIVERED,
        CONFIRMED,
        DISPUTED,
        RESOLVED,
        CANCELLED
    }

    // ─── Structs ────────────────────────────────────────────────────
    struct Escrow {
        uint256 listingId;
        address buyer;
        address worker;
        address paymentToken;   // address(0) = ETH
        uint256 amount;
        EscrowStatus status;
        uint256 createdAt;
        uint256 deliveredAt;
        bytes deliverable;
    }

    // ─── Constants ──────────────────────────────────────────────────
    uint256 public constant ESCROW_FEE_BPS = 200;      // 2%
    uint256 public constant CANCEL_FEE_BPS = 50;        // 0.5%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant TIMEOUT_DURATION = 48 hours;
    bytes32 public constant BOARD_SCORE_KEY = keccak256("board.reputation");

    // ─── State ──────────────────────────────────────────────────────
    ITheBoard public immutable board;
    IExoScorer public immutable exoCore;
    address public houseWallet;

    Escrow[] public escrows;

    // Per-address stats
    mapping(address => uint256) public jobsCompleted;
    mapping(address => uint256) public jobsHired;

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _board, address _exoCore, address _houseWallet) Ownable(msg.sender) {
        if (_board == address(0) || _exoCore == address(0) || _houseWallet == address(0))
            revert ZeroAddress();
        board = ITheBoard(_board);
        exoCore = IExoScorer(_exoCore);
        houseWallet = _houseWallet;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ESCROW LIFECYCLE
    // ═══════════════════════════════════════════════════════════════

    function createEscrow(
        uint256 listingId,
        address worker
    ) external payable nonReentrant returns (uint256 escrowId) {
        if (worker == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        escrowId = escrows.length;
        escrows.push(Escrow({
            listingId: listingId,
            buyer: msg.sender,
            worker: worker,
            paymentToken: address(0),
            amount: msg.value,
            status: EscrowStatus.CREATED,
            createdAt: block.timestamp,
            deliveredAt: 0,
            deliverable: ""
        }));

        emit EscrowCreated(escrowId, listingId, msg.sender, worker, msg.value);
    }

    function createEscrowERC20(
        uint256 listingId,
        address worker,
        address token,
        uint256 amount
    ) external nonReentrant returns (uint256 escrowId) {
        if (worker == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        escrowId = escrows.length;
        escrows.push(Escrow({
            listingId: listingId,
            buyer: msg.sender,
            worker: worker,
            paymentToken: token,
            amount: amount,
            status: EscrowStatus.CREATED,
            createdAt: block.timestamp,
            deliveredAt: 0,
            deliverable: ""
        }));

        emit EscrowCreated(escrowId, listingId, msg.sender, worker, amount);
    }

    function acceptEscrow(uint256 escrowId) external {
        Escrow storage e = _getEscrow(escrowId);
        if (e.worker != msg.sender) revert NotWorker();
        if (e.status != EscrowStatus.CREATED) revert InvalidState();

        e.status = EscrowStatus.ACCEPTED;

        emit EscrowAccepted(escrowId);
    }

    function submitDeliverable(uint256 escrowId, bytes calldata deliverable) external {
        Escrow storage e = _getEscrow(escrowId);
        if (e.worker != msg.sender) revert NotWorker();
        if (e.status != EscrowStatus.ACCEPTED) revert InvalidState();

        e.status = EscrowStatus.DELIVERED;
        e.deliveredAt = block.timestamp;
        e.deliverable = deliverable;

        emit DeliverableSubmitted(escrowId, deliverable);
    }

    function confirmDelivery(uint256 escrowId) external nonReentrant {
        Escrow storage e = _getEscrow(escrowId);
        if (e.buyer != msg.sender) revert NotBuyer();
        if (e.status != EscrowStatus.DELIVERED) revert InvalidState();

        e.status = EscrowStatus.CONFIRMED;

        _releaseFunds(e);
        _updateStats(e);
        _writeReputation(e);

        emit DeliveryConfirmed(escrowId);
    }

    function disputeDelivery(uint256 escrowId) external {
        Escrow storage e = _getEscrow(escrowId);
        if (e.buyer != msg.sender) revert NotBuyer();
        if (e.status != EscrowStatus.DELIVERED) revert InvalidState();

        e.status = EscrowStatus.DISPUTED;

        emit DeliveryDisputed(escrowId);
    }

    function resolveDispute(uint256 escrowId, bool toWorker) external onlyOwner nonReentrant {
        Escrow storage e = _getEscrow(escrowId);
        if (e.status != EscrowStatus.DISPUTED) revert InvalidState();

        e.status = EscrowStatus.RESOLVED;

        if (toWorker) {
            _releaseFunds(e);
            _updateStats(e);
            _writeReputation(e);
        } else {
            // Refund buyer (no fee on dispute resolution for buyer)
            _transferFunds(e.paymentToken, e.buyer, e.amount);
        }

        emit DisputeResolved(escrowId, toWorker);
    }

    function cancelEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage e = _getEscrow(escrowId);
        if (e.buyer != msg.sender) revert NotBuyer();
        if (e.status != EscrowStatus.CREATED) revert InvalidState();

        e.status = EscrowStatus.CANCELLED;

        // 0.5% cancellation fee
        uint256 fee = (e.amount * CANCEL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 refund = e.amount - fee;

        if (fee > 0) {
            _transferFunds(e.paymentToken, houseWallet, fee);
        }
        _transferFunds(e.paymentToken, e.buyer, refund);

        emit EscrowCancelled(escrowId);
    }

    function claimTimeout(uint256 escrowId) external nonReentrant {
        Escrow storage e = _getEscrow(escrowId);
        if (e.worker != msg.sender) revert NotWorker();
        if (e.status != EscrowStatus.DELIVERED) revert InvalidState();
        if (block.timestamp < e.deliveredAt + TIMEOUT_DURATION) revert TimeoutNotReached();

        e.status = EscrowStatus.CONFIRMED;

        _releaseFunds(e);
        _updateStats(e);
        _writeReputation(e);

        emit TimeoutClaimed(escrowId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIPS
    // ═══════════════════════════════════════════════════════════════

    function tip(address recipient) external payable nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        (bool sent, ) = recipient.call{value: msg.value}("");
        if (!sent) revert TransferFailed();

        emit TipSent(msg.sender, recipient, msg.value);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _getEscrow(escrowId);
    }

    function getEscrowCount() external view returns (uint256) {
        return escrows.length;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setHouseWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert ZeroAddress();
        emit HouseWalletUpdated(houseWallet, newWallet);
        houseWallet = newWallet;
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _getEscrow(uint256 escrowId) internal view returns (Escrow storage) {
        if (escrowId >= escrows.length) revert InvalidState();
        return escrows[escrowId];
    }

    function _releaseFunds(Escrow storage e) internal {
        uint256 fee = (e.amount * ESCROW_FEE_BPS) / BPS_DENOMINATOR;
        uint256 payout = e.amount - fee;

        if (fee > 0) {
            _transferFunds(e.paymentToken, houseWallet, fee);
        }
        _transferFunds(e.paymentToken, e.worker, payout);
    }

    function _transferFunds(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool sent, ) = to.call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _updateStats(Escrow storage e) internal {
        jobsCompleted[e.worker]++;
        jobsHired[e.buyer]++;
    }

    function _writeReputation(Escrow storage e) internal {
        // Try to write reputation — skip silently if scorer not granted
        // Worker reputation: jobs completed
        _tryWriteScore(e.worker, int256(jobsCompleted[e.worker]));
        // Buyer reputation: jobs hired
        _tryWriteScore(e.buyer, int256(jobsHired[e.buyer]));
    }

    function _tryWriteScore(address user, int256 score) internal {
        // Look up user's first Exo token ID via balanceOf
        // If they have an Exo, try to write. setExternalScore will revert if
        // scorer not granted, so we wrap in try/catch.
        try exoCore.balanceOf(user) returns (uint256 bal) {
            if (bal == 0) return;
            // Get their first token via tokenOfOwnerByIndex if available
            try exoCore.tokenOfOwnerByIndex(user, 0) returns (uint256 tokenId) {
                try exoCore.setExternalScore(tokenId, BOARD_SCORE_KEY, score) {} catch {}
            } catch {}
        } catch {}
    }
}

// ─── Interfaces ─────────────────────────────────────────────────

interface ITheBoard {
    function isActive(uint256 listingId) external view returns (bool);
}

interface IExoScorer {
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function setExternalScore(uint256 tokenId, bytes32 scoreKey, int256 value) external;
}
