// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../access/Governable.sol";
import "../../interface/oracle/IOracle.sol";

/**
 * @title Oracle for `CTokens`
 */
abstract contract InterestBearingOracle is IOracle, Governable {
    /**
     * @notice The oracle that resolves the price of underlying token
     */
    IOracle public underlyingOracle;

    constructor(IOracle _underlyingOracle) {
        underlyingOracle = _underlyingOracle;
    }

    /**
     * @notice Convert asset's amount to USD
     * @param _asset The asset's address
     * @param _amount The amount to convert
     * @return _amountInUsd The amount in USD (8 decimals)
     */
    function convertToUsd(IERC20 _asset, uint256 _amount) public view returns (uint256 _amountInUsd) {
        address _underlyingAddress = _getUnderlyingAsset(_asset);
        uint256 _underlyingAmount = _toUnderlyingAmount(_asset, _amount);
        return underlyingOracle.convertToUsd(IERC20(_underlyingAddress), _underlyingAmount);
    }

    /**
     * @notice Convert USD to asset's amount
     * @param _asset The asset's address
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The converted amount
     */
    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) public view returns (uint256 _amount) {
        address _underlyingAddress = _getUnderlyingAsset(_asset);
        uint256 _underlyingAmount = underlyingOracle.convertFromUsd(IERC20(_underlyingAddress), _amountInUsd);
        return _fromUnderlyingAmount(_asset, _underlyingAmount);
    }

    /**
     * @notice Get underlying asset from IB token
     * @param _asset IB token
     * @return _underlying The IB token underlying
     */
    function _getUnderlyingAsset(IERC20 _asset) internal view virtual returns (address _underlying);

    /**
     * @notice Convert IB amount to underlying amount
     * @param _asset IB token
     * @param _amount IB token amount
     * @return _underlyingAmount underlying token amount
     */
    function _toUnderlyingAmount(IERC20 _asset, uint256 _amount)
        internal
        view
        virtual
        returns (uint256 _underlyingAmount);

    /**
     * @notice Convert underlying amount to IB amount
     * @param _asset IB token
     * @param _underlyingAmount underlying token amount
     * @return _amount IB token amount
     */
    function _fromUnderlyingAmount(IERC20 _asset, uint256 _underlyingAmount)
        internal
        view
        virtual
        returns (uint256 _amount);
}
