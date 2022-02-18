// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/utils/math/Math.sol";
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
     * @notice Get asset's USD price
     * @param _assetData The asset's query encoded data
     * @return _priceInUsd The amount in USD (8 decimals)
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function getPriceInUsd(bytes memory _assetData)
        public
        view
        override
        returns (uint256 _priceInUsd, uint256 _lastUpdatedAt)
    {
        (address _aggregator, ) = _decode(_assetData);
        (_priceInUsd, _lastUpdatedAt) = _getPriceOfAsset(_aggregator);
    }

    /**
     * @dev This function is here just to follow IPriceProvider
     */
    // solhint-disable-next-line no-empty-blocks
    function update(bytes memory) external {}
}
