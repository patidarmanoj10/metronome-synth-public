// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../interface/oracle/IOracle.sol";
import "../../interface/external/ICurveAddressProvider.sol";

/**
 * @title Oracle for Curve LP tokens
 */
contract CurveLpTokenOracle is IOracle {
    ICurveAddressProvider public addressProvider;

    constructor(ICurveAddressProvider _addressProvider) {
        addressProvider = _addressProvider;
    }

    /**
     * @notice Get Curve LP's USD price
     * @param _asset The asset's to get price from
     * @return _priceInUsd The amount in USD (18 decimals)
     */
    function getPriceInUsd(IERC20 _asset) external view returns (uint256 _priceInUsd) {
        return addressProvider.get_registry().get_virtual_price_from_lp_token(address(_asset));
    }
}
