// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../utils/TokenHolder.sol";

contract TokenHolderMock is TokenHolder {
    address public sweeper;
    bool public acceptETH;

    constructor(address _sweeper) {
        sweeper = _sweeper;
    }

    function _requireCanSweep() internal view override {
        require(msg.sender == sweeper, "not-sweeper");
    }

    function toggleAcceptETH() public {
        acceptETH = !acceptETH;
    }

    receive() external payable override {
        require(acceptETH, "not-allowed-to-receive-eth");
    }
}
