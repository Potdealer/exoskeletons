// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IExoModule — Standard Interface for Exoskeleton Modules
 * @notice Defines the convention that module contracts should implement
 *         to be discoverable and composable within the Exoskeleton ecosystem.
 *
 * @dev This is a soft standard. The current ExoskeletonCore and ModuleMarketplace
 *      contracts do not call into module contracts — modules are registered by
 *      bytes32 name and tracked independently. This interface establishes the
 *      convention for module metadata, lifecycle hooks, and composability.
 *
 *      Module contracts that implement IExoModule gain:
 *        - Discoverability: anyone can query what a module does
 *        - Lifecycle hooks: onActivate/onDeactivate for per-token initialization
 *        - Forward compatibility: ready for future Core upgrades that call modules
 *        - Composability: other modules/contracts can check isExoModule()
 *
 *      CC0 — Creative Commons Zero. No rights reserved.
 */
interface IExoModule {
    // ─── Metadata ──────────────────────────────────────────────────

    /// @notice Human-readable module name (e.g. "storage-vault")
    function moduleName() external view returns (string memory);

    /// @notice Module version string (semver recommended, e.g. "1.0.0")
    function moduleVersion() external view returns (string memory);

    /// @notice Brief description of what this module does
    function moduleDescription() external view returns (string memory);

    /// @notice Address of the module builder/deployer
    function builder() external view returns (address);

    /// @notice The bytes32 key used in ExoskeletonCore/Marketplace registration
    /// @dev Should equal keccak256(abi.encodePacked(moduleName()))
    function moduleKey() external view returns (bytes32);

    // ─── Identity ──────────────────────────────────────────────────

    /// @notice Returns true if this contract implements the IExoModule standard
    function isExoModule() external pure returns (bool);

    // ─── Lifecycle ─────────────────────────────────────────────────

    /// @notice Called when a token activates this module
    /// @dev In the current system, the token owner calls this after
    ///      activating on Core/Marketplace. Future Core upgrades may
    ///      call this automatically.
    /// @param tokenId The exoskeleton token activating the module
    function onActivate(uint256 tokenId) external;

    /// @notice Called when a token deactivates this module
    /// @param tokenId The exoskeleton token deactivating the module
    function onDeactivate(uint256 tokenId) external;

    // ─── Status ────────────────────────────────────────────────────

    /// @notice Check if this module is active for a specific token
    /// @param tokenId The exoskeleton token to check
    /// @return True if the module has been activated for this token
    function isActiveFor(uint256 tokenId) external view returns (bool);
}
