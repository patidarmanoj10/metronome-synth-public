// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";

interface IDebtToken is IERC20, IERC20Metadata {
    function mint(address _to, uint256 _amount) external;

    function burn(address _from, uint256 _amount) external;
}
