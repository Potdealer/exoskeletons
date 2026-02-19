// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../BaseModule.sol";

/**
 * @title MockModule — Test helper for BaseModule
 * @dev Minimal concrete implementation. Tracks hook calls for test assertions.
 */
contract MockModule is BaseModule {
    uint256 public activateCallCount;
    uint256 public deactivateCallCount;
    uint256 public lastActivatedToken;
    uint256 public lastDeactivatedToken;

    constructor(
        string memory name_,
        string memory version_,
        address core_
    ) BaseModule(name_, version_, "Mock module for testing", core_) {}

    function _onActivate(uint256 tokenId) internal override {
        activateCallCount++;
        lastActivatedToken = tokenId;
    }

    function _onDeactivate(uint256 tokenId) internal override {
        deactivateCallCount++;
        lastDeactivatedToken = tokenId;
    }
}
