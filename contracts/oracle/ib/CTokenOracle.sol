// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./InterestBearingOracle.sol";
import "../../interface/external/ICToken.sol";

/**
 * @title Oracle for `CTokens`
 */
contract CTokenOracle is InterestBearingOracle {
    constructor(IOracle _underlyingOracle) InterestBearingOracle(_underlyingOracle) {}

    function _getUnderlyingAsset(IERC20 _asset) internal view override returns (address _underlying) {
        return ICToken(address(_asset)).underlying();
    }

    function _toUnderlyingAmount(IERC20 _asset, uint256 _underlyingAmount)
        internal
        view
        override
        returns (uint256 _amount)
    {
        return (_underlyingAmount * ICToken(address(_asset)).exchangeRateStored()) / 1e18;
    }
}
