// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "../interface/oracle/IMasterOracle.sol";

contract MasterOracleMock is IMasterOracle {
    mapping(IERC20 => uint256) public rates;

    function updateRate(IERC20 _asset, uint256 _rate) external {
        rates[_asset] = _rate;
    }

    function convertToUsd(IERC20 _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        _amountInUsd = (_amount * rates[_asset]) / 10**IERC20Metadata(address(_asset)).decimals();
    }

    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        _amount = (_amountInUsd * 10**IERC20Metadata(address(_asset)).decimals()) / rates[_asset];
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
