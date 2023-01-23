// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./ISwapper.sol";

interface IRoutedSwapper is ISwapper {
    function setDefaultRouting(
        uint8 swapType_,
        address tokenIn_,
        address tokenOut_,
        uint8 exchange_,
        bytes calldata path_
    ) external;
}
