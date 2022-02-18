// SPDX-License-Identifier: MIT

// solhint-disable no-empty-blocks

pragma solidity 0.8.9;

import "../interface/oracle/IOracle.sol";

contract DefaultOracleMock is IOracle {
    mapping(IERC20 => uint256) public rates;

    function updateRate(IERC20 _asset, uint256 _rate) external {
        rates[_asset] = _rate;
    }

    function getPriceInUsd(IERC20 _asset) public view override returns (uint256 _priceInUsd) {
        return rates[_asset];
    }
}
