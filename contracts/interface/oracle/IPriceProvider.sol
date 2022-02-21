// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IPriceProvider {
    function update(bytes memory _assetData) external;

    function getPriceInUsd(bytes memory _assetData) external view returns (uint256 _priceInUsd, uint256 _lastUpdatedAt);
}
