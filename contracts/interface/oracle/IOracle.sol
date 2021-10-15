// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./IPriceProvider.sol";

interface IOracle {
    function update(IERC20 _asset) external;

    function convertToUsdUsingLatestPrice(IERC20 _asset, uint256 _amount)
        external
        view
        returns (uint256 _amountInUsd, bool _priceInvalid);

    function convertFromUsdUsingLatestPrice(IERC20 _asset, uint256 _amountInUsd)
        external
        view
        returns (uint256 _amount, bool _priceInvalid);

    function convertUsingLatestPrice(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) external view returns (uint256 _amountOut, bool _anyPriceInvalid);

    function convertToUsd(IERC20 _asset, uint256 _amount) external returns (uint256 _amountInUsd);

    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) external returns (uint256 _amount);

    function convert(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut);
}
