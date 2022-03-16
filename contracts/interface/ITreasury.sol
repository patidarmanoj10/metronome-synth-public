// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";

interface ITreasury {
    function pull(address _to, uint256 _amount) external;

    function migrateTo(address _newTreasury) external;
}
