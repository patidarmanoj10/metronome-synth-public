// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./InterestBearingOracle.sol";
import "../../interface/external/IAToken.sol";

/**
 * @title Oracle for `ATokens`
 */
contract ATokenOracle is InterestBearingOracle {
    constructor(IOracle _underlyingOracle) InterestBearingOracle(_underlyingOracle) {}

    function _getUnderlyingAsset(IERC20 _asset) internal view override returns (address _underlying) {
        return IAToken(address(_asset)).UNDERLYING_ASSET_ADDRESS();
    }
}
