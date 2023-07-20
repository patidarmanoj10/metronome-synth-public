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
    /**
     * @notice The base gas to pay for cross-chain calls
     * @dev This limit covers basic token transfer LZ cost
     */
    uint256 public lzBaseGasLimit;

    /**
     * @notice The slippage we're willing to accept for SG like:like transfers
     */
    uint256 public stargateSlippage;

    /**
     * @notice The gas limit to cover `Layer2ProxyOFT.onOFTReceived()` call
     */
    uint64 public flashRepayCallbackTxGasLimit;

    /**
     * @notice The gas limit to cover `Layer1ProxyOFT.sgReceive()` call
     */
    uint64 public flashRepaySwapTxGasLimit;

    /**
     * @notice The gas limit to cover `Layer2ProxyOFT.sgReceive()` call
     */
    uint64 public leverageCallbackTxGasLimit;

    /**
     * @notice The gas limit to cover `Layer1ProxyOFT.onOFTReceived()` call
     */
    uint64 public leverageSwapTxGasLimit;

    /**
     * @notice The LZ Ethereum mainnet Id
     */
    uint16 public lzMainnetChainId;

    /**
     * @notice Flag that pause/unpause all cross-chain activities
     */
    bool public isBridgingActive;

    /**
     * @notice The Stargate Router contract
     */
    IStargateRouter public stargateRouter;

    /**
     * @notice The Quoter contract
     */
    IQuoter public quoter;

    /**
     * @notice Maps Stargate's token pools
     */
    mapping(address => uint256) public stargatePoolIdOf;
}
