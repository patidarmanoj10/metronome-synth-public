// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./IPriceProvider.sol";

interface IOracle {
    function getPriceInUsd(IERC20 _asset) external view returns (uint256 _priceInUsd);
}
