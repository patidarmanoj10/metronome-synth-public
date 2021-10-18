// SPDX-License-Identifier: MIT

// solhint-disable no-empty-blocks

pragma solidity 0.8.9;

import "../interface/oracle/IOracle.sol";
import "../lib/WadRayMath.sol";

contract OracleMock is IOracle {
    using WadRayMath for uint256;

    mapping(IERC20 => uint256) public rates;

    function updateRate(IERC20 _asset, uint256 _rate) external {
        rates[_asset] = _rate;
    }

    function update(IERC20 _asset) external {}

    function convertToUsdUsingLatestPrice(IERC20 _asset, uint256 _amount)
        public
        view
        override
        returns (uint256 _amountInUsd, bool _priceInvalid)
    {
        _amountInUsd = _amount.wadMul(rates[_asset]);
    }

    function convertFromUsdUsingLatestPrice(IERC20 _asset, uint256 _amountInUsd)
        public
        view
        override
        returns (uint256 _amount, bool _priceInvalid)
    {
        _amount = _amountInUsd.wadDiv(rates[_asset]);
    }

    function convertUsingLatestPrice(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut, bool _priceInvalid) {
        uint256 _amountInUsd = convertToUsd(_assetIn, _amountIn);
        _amountOut = convertFromUsd(_assetOut, _amountInUsd);
    }

    function convertToUsd(IERC20 _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        (_amountInUsd, ) = convertToUsdUsingLatestPrice(_asset, _amount);
    }

    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        (_amount, ) = convertFromUsdUsingLatestPrice(_asset, _amountInUsd);
    }

    function convert(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut) {
        (_amountOut, ) = convertUsingLatestPrice(_assetIn, _assetOut, _amountIn);
    }
}
