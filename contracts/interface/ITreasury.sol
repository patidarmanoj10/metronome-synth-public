// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";

interface ITreasury {
    function pull(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external;
}
