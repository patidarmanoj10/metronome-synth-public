// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IOracle {
    function rateOf(address _asset) external returns (uint256);

    function convertToUSD(address _asset, uint256 _amount) external view returns (uint256 _amountInUsd);

    function convertFromUSD(address _asset, uint256 _amountInUsd) external view returns (uint256 _amount);

    function convert(
        address _assetIn,
        address _assetOut,
        uint256 _amountIn
    ) external view returns (uint256 _amountOut);
}
