// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IPriceProvider {
    function update(address _assetData) external;

    function getPriceInUsd(address _assetData) external view returns (uint256 _priceInUsd, uint256 _lastUpdatedAt);
}
