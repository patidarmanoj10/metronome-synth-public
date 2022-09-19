// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./storage/PoolRegistryStorage.sol";
import "./access/Governable.sol";

/**
 * @title PoolRegistry contract
 */
contract PoolRegistry is Governable, PoolRegistryStorageV1 {
    using EnumerableSet for EnumerableSet.AddressSet;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when a pool is registered
    event PoolRegistered(address pool);

    /// @notice Emitted when a pool is unregistered
    event PoolUnregistered(address pool);

    function initialize() public initializer {
        __Governable_init();
    }

    /**
     * @notice Check if pool is registered
     * @param pool_ Pool to check
     * @return true if exists
     */
    function poolExists(address pool_) public view returns (bool) {
        return pools.contains(pool_);
    }

    /**
     * @notice Get all pools
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getPools() external view returns (address[] memory) {
        return pools.values();
    }

    /**
     * @notice Register pool
     */
    function registerPool(address pool_) external onlyGovernor {
        require(pool_ != address(0), "address-is-null");
        require(pools.add(pool_), "already-registered");
        emit PoolRegistered(pool_);
    }

    /**
     * @notice Unregister pool
     */
    function unregisterPool(address pool_) external onlyGovernor {
        require(pools.remove(pool_), "not-registered");
        emit PoolUnregistered(pool_);
    }
}
