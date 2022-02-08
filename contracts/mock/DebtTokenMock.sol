// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../DebtToken.sol";

contract DebtTokenMock is DebtToken {
    uint256 private blockNumber;

    function incrementBlockNumber(uint256 _toIncrement) external {
        blockNumber = getBlockNumber() + _toIncrement;
    }

    function getBlockNumber() public view override returns (uint256 _blockNumber) {
        _blockNumber = blockNumber > 0 ? blockNumber : block.number;
    }
}
