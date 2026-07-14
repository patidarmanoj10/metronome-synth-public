// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IERC20} from "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";

interface IVPool is IERC20 {
    function token() external view returns (address _token);

    function deposit(uint256 _amount) external;

    function withdraw(uint256 _shares) external;

    function poolRewards() external view returns (address);

    function pricePerShare() external view returns (uint256);
}
