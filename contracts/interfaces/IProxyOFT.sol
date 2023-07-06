// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/@layerzerolabs/solidity-examples/token/oft/composable/IOFTReceiver.sol";
import "../dependencies/@layerzerolabs/solidity-examples/token/oft/composable/IComposableOFTCore.sol";
import "../dependencies/stargate-protocol/interfaces/IStargateRouter.sol";

interface IProxyOFT is IComposableOFTCore, IOFTReceiver {
    function stargateRouter() external view returns (IStargateRouter);

    function quoteFlashRepaySwapNativeFee(
        address l2Pool_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external view returns (uint256 _nativeFee);

    function quoteLeverageSwapNativeFee(
        address l2Pool_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external view returns (uint256 _nativeFee);

    function triggerFlashRepaySwap(
        uint256 id_,
        address payable account_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external payable;

    function triggerLeverageSwap(
        uint256 id_,
        address payable account_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin,
        uint256 callbackTxNativeFee_
    ) external payable;
}
