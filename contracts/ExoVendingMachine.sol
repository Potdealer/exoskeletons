// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ExoVendingMachine
 * @notice Receive ETH, emit an event. A keeper mints Exoskeletons to buyers.
 *
 *         Works with ERC-4337 smart wallets (Bankr, etc.) because events
 *         fire regardless of whether ETH arrives via direct transfer or
 *         internal call through EntryPoint.
 *
 *         Usage via Bankr: "send 0.005 ETH to [this address] on Base"
 *         Keeper detects the event → calls ownerMint → Exo sent to buyer.
 */
contract ExoVendingMachine {
    address public immutable owner;
    uint256 public constant MINT_PRICE = 0.005 ether;

    event PaymentReceived(address indexed buyer, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed to, uint256 amount);

    error WrongPayment();
    error NotOwner();
    error WithdrawFailed();

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Send exactly 0.005 ETH to queue a mint.
     */
    receive() external payable {
        if (msg.value != MINT_PRICE) revert WrongPayment();
        emit PaymentReceived(msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Withdraw collected ETH to owner.
     */
    function withdraw() external {
        if (msg.sender != owner) revert NotOwner();
        uint256 bal = address(this).balance;
        (bool ok,) = owner.call{value: bal}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(owner, bal);
    }
}
