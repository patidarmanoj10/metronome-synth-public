// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IPriceProvider {
    function update(bytes calldata _assetData) external;

    function getPriceInUsd(bytes calldata _assetData)
        external
        view
        returns (uint256 _priceInUsd, uint256 _lastUpdatedAt);
}
