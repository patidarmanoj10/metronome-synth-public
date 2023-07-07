// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IProxyOFT.sol";

interface ILayer2ProxyOFT is IProxyOFT {
    function quoteTriggerFlashRepaySwapNativeFee(bytes calldata lzArgs_) external view returns (uint256 _nativeFee);

    function quoteTriggerLeverageSwapNativeFee(bytes calldata lzArgs_) external view returns (uint256 _nativeFee);

    function triggerFlashRepaySwap(
        uint256 id_,
        address payable account_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable;

    function triggerLeverageSwap(
        uint256 id_,
        address payable account_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin,
        bytes calldata lzArgs_
    ) external payable;
}
