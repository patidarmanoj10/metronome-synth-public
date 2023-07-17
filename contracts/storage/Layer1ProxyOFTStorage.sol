// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

abstract contract Layer1ProxyOFTStorage {
    mapping(uint256 => uint256) public swapAmountOutMin;

    // TODO: Move to `SmartFarmManager`, `Pool` or `PoolRegistry`?
    uint64 public flashRepayCallbackTxGasLimit;
    uint64 public flashRepaySwapTxGasLimit;
    uint64 public leverageCallbackTxGasLimit;
    uint64 public leverageSwapTxGasLimit;
}
