// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import "../interfaces/IPoolRegistry.sol";
import "../interfaces/external/IMasterOracle.sol";

abstract contract PoolRegistryStorageV1 is IPoolRegistry {
    /**
     * @notice Prices oracle
     */
    IMasterOracle public masterOracle;

    /**
     * @notice Pools collection
     */
    EnumerableSet.AddressSet internal pools;
    /**
     * @notice Fee collector address
     */
    address public feeCollector;

    /**
     * @notice The fee charged when swapping synthetic tokens
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public swapFee;

    /**
     * @notice Available debt tokens
     */
    EnumerableSet.AddressSet internal syntheticTokens;
}
