// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/external/ISwapper.sol";

abstract contract Layer1ProxyOFTStorage {
    ISwapper public swapper; // TODO: Use from SFM

    mapping(uint256 => uint256) swapAmountOutMin;

    // TODO: Move to `SmartFarmManager`, `Pool` or `PoolRegistry`?
    uint64 public flashRepayCallbackTxGasLimit;
    uint64 public flashRepaySwapTxGasLimit;
    uint64 public leverageCallbackTxGasLimit;
    uint64 public leverageSwapTxGasLimit;
}
