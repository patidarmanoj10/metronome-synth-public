// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";

contract TokenOracleMock {
    mapping(address => uint256) public prices;

    function updatePrice(address token_, uint256 price_) external {
        prices[token_] = price_;
    }

    function getPriceInUsd(address token_) external view returns (uint256 _priceInUsd) {
        return prices[token_];
    }
}
