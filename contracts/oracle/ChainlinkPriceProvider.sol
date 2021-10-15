// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/utils/math/SafeCast.sol";
import "../dependencies/chainlink/interfaces/AggregatorV3Interface.sol";
import "../interface/oracle/IPriceProvider.sol";

/**
 * @title ChainLink's price provider
 * @dev This contract wrapps chainlink agreggators
 */
contract ChainlinkPriceProvider is IPriceProvider {
    /**
     * @notice Get price from an aggregator
     * @param _aggregator The aggregator contract address
     * @return The price and its timestamp
     */
    function _getPriceOfAsset(address _aggregator) private view returns (uint256, uint256) {
        (, int256 _price, , uint256 _lastUpdatedAt, ) = AggregatorV3Interface(_aggregator).latestRoundData();
        return (SafeCast.toUint256(_price), _lastUpdatedAt);
    }

    /**
     * @notice Decode asset data
     * @param _assetData The asset's query encoded data
     * @return _aggregator The aggregator contract address
     * @return _decimals The asset's decimals
     */
    function _decode(bytes memory _assetData) private pure returns (address _aggregator, uint8 _decimals) {
        (_aggregator, _decimals) = abi.decode(_assetData, (address, uint8));
    }

    /**
     * @notice Convert asset's amount to USD
     * @param _assetData The asset's query encoded data
     * @param _amount The amount to convert
     * @return _amountInUsd The amount in USD (8 decimals)
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function convertToUsd(bytes memory _assetData, uint256 _amount)
        external
        view
        override
        returns (uint256 _amountInUsd, uint256 _lastUpdatedAt)
    {
        (address _aggregator, uint256 _decimals) = _decode(_assetData);
        uint256 _price;
        (_price, _lastUpdatedAt) = _getPriceOfAsset(_aggregator);
        _amountInUsd = (_amount * _price) / 10**_decimals;
    }

    /**
     * @notice Convert USD to asset's amount
     * @param _assetData The asset's query encoded data
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The amount to convert
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function convertFromUsd(bytes memory _assetData, uint256 _amountInUsd)
        external
        view
        override
        returns (uint256 _amount, uint256 _lastUpdatedAt)
    {
        (address _aggregator, uint256 _decimals) = _decode(_assetData);
        uint256 _price;
        (_price, _lastUpdatedAt) = _getPriceOfAsset(_aggregator);
        _amount = (_amountInUsd * 10**_decimals) / _price;
    }

    /**
     * @dev This function is here just to follow IPriceProvider
     */
    // solhint-disable-next-line no-empty-blocks
    function update(bytes memory) external {}
}
