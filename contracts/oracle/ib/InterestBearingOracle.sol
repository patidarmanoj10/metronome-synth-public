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
     * @notice Get asset's USD price
     * @param _asset The asset's to get price from
     * @return _priceInUsd The amount in USD (18 decimals)
     */
    function getPriceInUsd(IERC20 _asset) external view returns (uint256 _priceInUsd) {
        address _underlyingAddress = _getUnderlyingAsset(_asset);
        _priceInUsd = underlyingOracle.getPriceInUsd(IERC20(_underlyingAddress));
    }

    /**
     * @notice Get underlying asset from IB token
     * @param _asset IB token
     * @return _underlying The IB token underlying
     */
    function _getUnderlyingAsset(IERC20 _asset) internal view virtual returns (address _underlying);
}
