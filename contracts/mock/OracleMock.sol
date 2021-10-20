// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/oracle/IOracle.sol";
import "../lib/WadRayMath.sol";

contract OracleMock is IOracle {
    using WadRayMath for uint256;

    mapping(IERC20 => uint256) public rates;

    function rateOf(IERC20 _asset) public view returns (uint256) {
        return rates[_asset];
    }

    function updateRate(IERC20 _asset, uint256 _rate) external {
        rates[_asset] = _rate;
    }

    function convertToUsd(IERC20 _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        _amountInUsd = _amount.wadMul(rateOf(_asset));
    }

    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        _amount = _amountInUsd.wadDiv(rateOf(_asset));
    }

    function convert(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut) {
        uint256 _amountInUsd = convertToUsd(_assetIn, _amountIn);
        _amountOut = convertFromUsd(_assetOut, _amountInUsd);
    }
}
