// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IERC20Metadata} from "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import {IMasterOracle} from "../interfaces/external/IMasterOracle.sol";

contract MasterOracleMock is IMasterOracle {
    mapping(address => uint256) public prices;

    uint256 public expireAt = type(uint256).max;
    uint256 public expirationPeriod = 100 * 365 days;

    function updatePrice(address _asset, uint256 _price) external {
        prices[_asset] = _price;
        expireAt = block.timestamp + expirationPeriod;
    }

    function quoteTokenToUsd(address _asset, uint256 _amount) public view override returns (uint256 _amountInUsd) {
        require(block.timestamp <= expireAt, "price-expired");
        _amountInUsd = (_amount * prices[_asset]) / 10 ** IERC20Metadata(address(_asset)).decimals();
    }

    function quoteUsdToToken(address _asset, uint256 _amountInUsd) public view override returns (uint256 _amount) {
        require(block.timestamp <= expireAt, "price-expired");
        _amount = (_amountInUsd * 10 ** IERC20Metadata(address(_asset)).decimals()) / prices[_asset];
    }

    function quote(
        address _assetIn,
        address _assetOut,
        uint256 _amountIn
    ) public view override returns (uint256 _amountOut) {
        uint256 _amountInUsd = quoteTokenToUsd(_assetIn, _amountIn);
        _amountOut = quoteUsdToToken(_assetOut, _amountInUsd);
    }

    function setExpirationPeriod(uint256 expirationPeriod_) public {
        expirationPeriod = expirationPeriod_;
    }
}
