// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../RewardsDistributor.sol";

contract RewardsDistributorMock is RewardsDistributor {
    uint256 private blockNumber;

    constructor() {
        blockNumber = block.number;
    }

    function incrementBlockNumber(uint256 _toIncrement) external {
        blockNumber += _toIncrement;
    }

    function getBlockNumber() public view override returns (uint256 _blockNumber) {
        return blockNumber;
    }
}
