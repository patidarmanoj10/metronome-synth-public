// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import "../dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
import "../interfaces/IPoolRegistry.sol";
import "../interfaces/external/IMasterOracle.sol";

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
    uint256 public lzBaseGasLimit;

    uint256 public stargateSlippage;

    uint64 public flashRepayCallbackTxGasLimit;
    uint64 public flashRepaySwapTxGasLimit;
    uint64 public leverageCallbackTxGasLimit;
    uint64 public leverageSwapTxGasLimit;

    uint16 public lzMainnetChainId;
    IStargateRouter public stargateRouter;

    IQuoter public quoter;

    mapping(address => uint256) public stargatePoolIdOf;
}
