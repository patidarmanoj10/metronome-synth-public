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
}
