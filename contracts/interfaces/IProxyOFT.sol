// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/@layerzerolabs/solidity-examples/token/oft/composable/IOFTReceiver.sol";
import "../dependencies/@layerzerolabs/solidity-examples/token/oft/IOFTCore.sol";

interface IProxyOFT is IOFTCore, IOFTReceiver {
    function quoteSwapAndCallbackNativeFee(
        address l2Pool_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_
    ) external view returns (uint256 _nativeFee);

    function swapAndCallback(
        uint256 id_,
        address payable refundAddress_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin
    ) external payable;
}
