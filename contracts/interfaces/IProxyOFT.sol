// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/@layerzerolabs/solidity-examples/token/oft/composable/IOFTReceiver.sol";
import "../dependencies/@layerzerolabs/solidity-examples/token/oft/IOFTCore.sol";
import "../dependencies/stargate-protocol/interfaces/IStargateRouter.sol";

interface IProxyOFT is IOFTCore, IOFTReceiver {
    function quoteSwapAndCallbackNativeFee(
        address l2Pool_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external view returns (uint256 _nativeFee);

    function swapAndCallback(
        uint256 id_,
        address payable refundAddress_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin,
        uint256 callbackTxNativeFee_
    ) external payable;

    function stargateRouter() external view returns (IStargateRouter);
}
