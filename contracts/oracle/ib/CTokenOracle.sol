// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../interface/external/ICToken.sol";
import "../../interface/oracle/IOracle.sol";
import "../../lib/OracleHelpers.sol";
import "../../lib/WadRayMath.sol";

/**
 * @title Oracle for `CTokens`
 */
contract CTokenOracle is IOracle {
    using WadRayMath for uint256;

    uint256 public constant ONE_CTOKEN = 1e8;
    /**
     * @notice The oracle that resolves the price of underlying token
     */
    IOracle public underlyingOracle;

    /**
     * @notice The address of the `CEther` underlying (Usually WETH)
     */
    address public wethLike;

    constructor(IOracle _underlyingOracle, address _wethLike) {
        underlyingOracle = _underlyingOracle;
        wethLike = _wethLike;
    }

    /**
     * @notice Get cToken's USD price
     * @param _asset The asset's to get price from
     * @return _priceInUsd The amount in USD (18 decimals)
     */
    function getPriceInUsd(IERC20 _asset) external view returns (uint256 _priceInUsd) {
        address _underlyingAddress;
        // Note: Compound's `CEther` hasn't the `underlying()` function, forks may return `address(0)` (e.g. RariFuse)
        try ICToken(address(_asset)).underlying() returns (address _underlying) {
            _underlyingAddress = _underlying;
        } catch {}

        if (_underlyingAddress == address(0)) {
            _underlyingAddress = wethLike;
        }
        uint256 _underlyingPriceInUsd = underlyingOracle.getPriceInUsd(IERC20(_underlyingAddress));
        uint256 _underlyingAmount = (ONE_CTOKEN * ICToken(address(_asset)).exchangeRateStored()) / 1e18;
        _priceInUsd = (_underlyingPriceInUsd * _underlyingAmount) / 10**IERC20Metadata(_underlyingAddress).decimals();
    }
}
