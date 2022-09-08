// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/external/IMasterOracle.sol";

contract MasterOracleMock is IMasterOracle {
    mapping(address => uint256) public prices;

    function updatePrice(address _asset, uint256 _price) external {
        prices[_asset] = _price;
    }

    function quoteTokenToUsd(address _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        _amountInUsd = (_amount * prices[_asset]) / 10**IERC20Metadata(address(_asset)).decimals();
    }

    function quoteUsdToToken(address _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        _amount = (_amountInUsd * 10**IERC20Metadata(address(_asset)).decimals()) / prices[_asset];
    }

    function quote(
        address _assetIn,
        address _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut) {
        uint256 _amountInUsd = quoteTokenToUsd(_assetIn, _amountIn);
        _amountOut = quoteUsdToToken(_assetOut, _amountInUsd);
    }
}
