// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./IPriceProvider.sol";

interface IOracle {
    function convertToUsd(IERC20 _asset, uint256 _amount) external view returns (uint256 _amountInUsd);

    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) external view returns (uint256 _amount);
}
