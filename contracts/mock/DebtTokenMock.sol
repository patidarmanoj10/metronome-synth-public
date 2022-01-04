// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../DebtToken.sol";

contract DebtTokenMock is DebtToken {
    uint256 private blockNumber;

    function setBlockNumber(uint256 _newBlockNumber) external {
        blockNumber = _newBlockNumber;
    }

    function getBlockNumber() public view override returns (uint256 _blockNumber) {
        _blockNumber = blockNumber > 0 ? blockNumber : block.number;
    }
}
