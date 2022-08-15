// SPDX-License-Identifier: MIT

// solhint-disable no-empty-blocks

pragma solidity 0.8.9;

import "../interfaces/oracle/IOracle.sol";

contract DefaultOracleMock is IOracle {
    mapping(IERC20 => uint256) public prices;

    function updatePrice(IERC20 _asset, uint256 _price) external {
        prices[_asset] = _price;
    }

    function getPriceInUsd(IERC20 _asset) public view override returns (uint256 _priceInUsd) {
        return prices[_asset];
    }
}
