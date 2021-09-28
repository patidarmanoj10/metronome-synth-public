// SPDX-License-Identifier: MIT

pragma solidity 0.8.8;

import "../interface/IOracle.sol";
import "../lib/WadRayMath.sol";

contract OracleMock is IOracle {
    using WadRayMath for uint256;

    mapping(address => uint256) public rates;

    function rateOf(address _asset) public view override returns (uint256) {
        return rates[_asset];
    }

    function updateRate(address _asset, uint256 _rate) external {
        rates[_asset] = _rate;
    }

    function convertToUSD(address _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        _amountInUsd = _amount.wadMul(rateOf(_asset));
    }

    function convertFromUSD(address _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        _amount = _amountInUsd.wadDiv(rateOf(_asset));
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
