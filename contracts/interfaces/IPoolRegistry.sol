// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
import "./external/IMasterOracle.sol";
import "./IPauseable.sol";
import "./IGovernable.sol";
import "./ISyntheticToken.sol";
import "./external/ISwapper.sol";

interface IPoolRegistry is IPauseable, IGovernable {
    function feeCollector() external view returns (address);

    function flashRepayCallbackTxGasLimit() external view returns (uint64);

    function flashRepaySwapTxGasLimit() external view returns (uint64);

    function isPoolRegistered(address pool_) external view returns (bool);

    function leverageCallbackTxGasLimit() external view returns (uint64);

    function leverageSwapTxGasLimit() external view returns (uint64);

    function lzBaseGasLimit() external view returns (uint256);

    function nativeTokenGateway() external view returns (address);

    function getPools() external view returns (address[] memory);

    function registerPool(address pool_) external;

    function stargateRouter() external view returns (IStargateRouter);

    function stargateSlippage() external view returns (uint256);

    function stargatePoolIdOf(address token_) external view returns (uint256);

    function unregisterPool(address pool_) external;

    function masterOracle() external view returns (IMasterOracle);

    function updateFeeCollector(address newFeeCollector_) external;

    function idOfPool(address pool_) external view returns (uint256);

    function nextPoolId() external view returns (uint256);

    function swapper() external view returns (ISwapper);

    function updateFlashRepayCallbackTxGasLimit(uint64 newFlashRepayCallbackTxGasLimit_) external;

    function updateFlashRepaySwapTxGasLimit(uint64 newFlashRepaySwapTxGasLimit_) external;

    function updateLeverageCallbackTxGasLimit(uint64 newLeverageCallbackTxGasLimit_) external;

    function updateLeverageSwapTxGasLimit(uint64 newLeverageSwapTxGasLimit_) external;

    function updateLzBaseGasLimit(uint256 newLzBaseGasLimit_) external;

    function updateMasterOracle(IMasterOracle newMasterOracle_) external;

    function updateNativeTokenGateway(address newGateway_) external;

    function updateStargatePoolIdOf(address token_, uint256 newPoolId_) external;

    function updateStargateSlippage(uint256 newStargateSlippage_) external;

    function updateStargateRouter(IStargateRouter newStargateRouter_) external;

    function updateSwapper(ISwapper newSwapper_) external;
}
