// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {EnumerableSet} from "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {IMasterOracle} from "../interfaces/external/IMasterOracle.sol";
import {ISwapper} from "../interfaces/external/ISwapper.sol";
import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";
import {IOperator} from "../interfaces/IOperator.sol";

abstract contract PoolRegistryStorageV1 is IPoolRegistry {
    /**
     * @notice Pools collection
     */
    EnumerableSet.AddressSet internal pools;

    /**
     * @notice Prices' oracle
     */
    IMasterOracle public override masterOracle;

    /**
     * @notice Fee collector address
     */
    address public override feeCollector;

    /**
     * @notice Native token gateway address
     */
    address public override nativeTokenGateway;

    /**
     * @notice Map of the ids of the pools
     */
    mapping(address => uint256) public override idOfPool;

    /**
     * @notice Counter of ids of the pools
     */
    uint256 public override nextPoolId;

    /**
     * @notice Swapper contract
     */
    ISwapper public swapper;
}

abstract contract PoolRegistryStorageV2 is PoolRegistryStorageV1 {
    /**
     * @notice The Quoter contract
     */
    address private quoter_DEPRECATED;

    /**
     * @notice The Cross-chain dispatcher contract
     */
    address private crossChainDispatcher_DEPRECATED;
}

abstract contract PoolRegistryStorageV3 is PoolRegistryStorageV2 {
    /**
     * @notice Flag that pause/unpause all cross-chain flash repay operations
     */
    bool private isCrossChainFlashRepayActive_DEPRECATED;
}

abstract contract PoolRegistryStorageV4 is PoolRegistryStorageV3 {
    /**
     * @notice Pools collection
     */
    EnumerableSet.AddressSet internal guardians;

    /**
     * @notice Flag that pause/unpause all cross-chain flash repay operations
     */
    IOperator public operator;
}

abstract contract PoolRegistryStorageV5 is PoolRegistryStorageV4 {
    /**
     * @notice The base gas to pay for cross-chain calls
     * @dev This limit covers basic token transfer LZ cost
     */
    uint256 public lzBaseGasLimit;

    /**
     * @notice Flag that pause/unpause all cross-chain activities
     */
    bool public isBridgingActive;

    /**
     * @notice Maps supported cross-chain routes (i.e. which chains are allowed to be used as source of liquidity)
     */
    mapping(uint16 => bool) public isDestinationChainSupported;
}
