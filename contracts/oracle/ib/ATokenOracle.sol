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

    function _toUnderlyingAmount(
        IERC20, /*_asset*/
        uint256 _amount
    ) internal pure override returns (uint256 _underlyingAmount) {
        return _amount;
    }

    function _fromUnderlyingAmount(
        IERC20, /*_asset*/
        uint256 _underlyingAmount
    ) internal pure override returns (uint256 _amount) {
        return _underlyingAmount;
    }
}
