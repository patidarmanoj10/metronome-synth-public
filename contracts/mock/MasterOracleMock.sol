// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/oracle/IMasterOracle.sol";

contract MasterOracleMock is IMasterOracle {
    mapping(IERC20 => uint256) public prices;

    function updatePrice(IERC20 _asset, uint256 _price) external {
        prices[_asset] = _price;
    }

    function quoteTokenToUsd(IERC20 _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        _amountInUsd = (_amount * prices[_asset]) / 10**IERC20Metadata(address(_asset)).decimals();
    }

    function quoteUsdToToken(IERC20 _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        _amount = (_amountInUsd * 10**IERC20Metadata(address(_asset)).decimals()) / prices[_asset];
    }

    function quote(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut) {
        uint256 _amountInUsd = quoteTokenToUsd(_assetIn, _amountIn);
        _amountOut = quoteUsdToToken(_assetOut, _amountInUsd);
    }
}
