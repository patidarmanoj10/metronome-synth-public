// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../interface/external/ICToken.sol";
import "../../interface/oracle/IOracle.sol";
import "../../access/Governable.sol";
import "../../lib/OracleHelpers.sol";
import "../../lib/WadRayMath.sol";

/**
 * @title Oracle for `CTokens`
 */
contract CTokenOracle is IOracle, Governable {
    using WadRayMath for uint256;

    uint256 public constant ONE_CTOKEN = 1e8;
    /**
     * @notice The oracle that resolves the price of underlying token
     */
    IOracle public underlyingOracle;

    constructor(IOracle _underlyingOracle) {
        underlyingOracle = _underlyingOracle;
    }

    /**
     * @notice Get cToken's USD price
     * @param _asset The asset's to get price from
     * @return _priceInUsd The amount in USD (18 decimals)
     */
    function getPriceInUsd(IERC20 _asset) external view returns (uint256 _priceInUsd) {
        address _underlyingAddress = ICToken(address(_asset)).underlying();
        uint256 _underlyinPriceInUsd = underlyingOracle.getPriceInUsd(IERC20(_underlyingAddress));
        uint256 _underlyingAmount = OracleHelpers.normalizeUsdOutput(
            _underlyingAddress,
            ONE_CTOKEN * ICToken(address(_asset)).exchangeRateStored()
        ) / 1e18;

        _priceInUsd = _underlyinPriceInUsd.wadMul(_underlyingAmount);
    }
}
