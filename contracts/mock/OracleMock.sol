// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../interface/IOracle.sol";

contract OracleMock is IOracle {
    mapping(address => uint256) public rates;

    function rateOf(address _asset) public view override returns (uint256) {
        return rates[_asset];
    }

    function updateRate(address _asset, uint256 _rate) external {
        rates[_asset] = _rate;
    }

    function convertToUSD(address _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        _amountInUsd = (_amount * rateOf(_asset)) / 1e18;
    }

    function convertFromUSD(address _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        _amount = (_amountInUsd * 1e18) / rateOf(_asset);
    }

    function convert(
        address _assetIn,
        address _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut) {
        uint256 _amountInUsd = convertToUSD(_assetIn, _amountIn);
        _amountOut = convertFromUSD(_assetOut, _amountInUsd);
    }
}
