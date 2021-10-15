// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/uniswap/v2-core/interfaces/IUniswapV2Pair.sol";
import "../dependencies/uniswap/lib/libraries/FixedPoint.sol";
import "../dependencies/uniswap/v2-periphery/libraries/UniswapV2OracleLibrary.sol";
import "../dependencies/uniswap/v2-periphery/libraries/UniswapV2Library.sol";
import "../dependencies/uniswap/v2-periphery/interfaces/IUniswapV2Router02.sol";
import "../access/Governable.sol";
import "../interface/oracle/IPriceProvider.sol";
import "../lib/OracleHelpers.sol";

/**
 * @title UniswapV2 (and forks) TWAP Oracle implementation
 * Based on https://github.com/Uniswap/v2-periphery/blob/master/contracts/examples/ExampleOracleSimple.sol
 */
// fixed window oracle that recomputes the average price for the entire period once every period
// note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract UniswapV2PriceProvider is IPriceProvider, Governable {
    using FixedPoint for *;

    /**
     * @notice The Uniswap-like factory contract
     * @dev The address isn't hardcoded because we may want to deploy mBOX to other chains
     */
    address public immutable factory;

    /**
     * @notice The WETH-like contract
     * @dev The address isn't hardcoded because we may want to deploy mBOX to other chains
     */
    address public immutable WETH;

    /**
     * @notice The USD token (stable coin) to use to convert amounts to/from USD
     * @dev This contract supports tokens with any decimals (e.g. USDC, DAI)
     */
    address public usdToken;

    /**
     * @notice The time-weighted average price (TWAP) period
     * @dev See more: https://docs.uniswap.org/protocol/concepts/V3-overview/oracle
     */
    uint256 public twapPeriod;

    /**
     * @notice Data of pair's oracle
     * @dev We have a default USDTOKEN:WETH pair and TOKEN:WETH for each tracked token
     */
    struct PairOracleData {
        address token0;
        address token1;
        uint256 price0CumulativeLast;
        uint256 price1CumulativeLast;
        uint32 blockTimestampLast;
        FixedPoint.uq112x112 price0Average;
        FixedPoint.uq112x112 price1Average;
    }

    /**
     * @notice Avaliable oracles
     * @dev Use TOKEN (don't WETH) as key for pairs
     */
    mapping(address => PairOracleData) public oracleDataOf;

    /// @notice Emitted when TWAP period is updated
    event TwapPeriodUpdated(uint256 oldTwapPeriod, uint256 newTwapPeriod);

    constructor(
        IUniswapV2Router02 _router,
        address _usdToken,
        uint256 _twapPeriod
    ) {
        require(address(_router) != address(0), "null-router-address");
        require(_usdToken != address(0), "null-usd-token-address");

        usdToken = _usdToken;
        twapPeriod = _twapPeriod;
        WETH = _router.WETH();
        factory = _router.factory();

        _addOracleForEthAnd(_usdToken);
    }

    /**
     * @notice Update TWAP period
     * @param _newTwapPeriod The new period
     */
    function updateTwapPeriod(uint256 _newTwapPeriod) public onlyGovernor {
        emit TwapPeriodUpdated(twapPeriod, _newTwapPeriod);
        twapPeriod = _newTwapPeriod;
    }

    /**
     * @notice Check if a oracle pair exists
     * @param _token The key token of a pair
     */
    function _hasOracleData(address _token) private view returns (bool) {
        if (_token == WETH) return true;
        return oracleDataOf[_token].blockTimestampLast != 0;
    }

    /**
     * @notice Add a oracle pair
     * @dev Will add a TOKEN:WETH pair
     * @param _token The token to add
     */
    function _addOracleForEthAnd(address _token) private {
        if (_hasOracleData(_token)) return;

        IUniswapV2Pair _pair = IUniswapV2Pair(UniswapV2Library.pairFor(factory, WETH, _token));

        (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) = _pair.getReserves();

        require(_reserve0 != 0 && _reserve1 != 0, "no-reserves");

        oracleDataOf[_token] = PairOracleData({
            token0: _pair.token0(),
            token1: _pair.token1(),
            price0CumulativeLast: _pair.price0CumulativeLast(),
            price1CumulativeLast: _pair.price1CumulativeLast(),
            blockTimestampLast: _blockTimestampLast,
            price0Average: uint112(0).encode(),
            price1Average: uint112(0).encode()
        });
    }

    /**
     * @notice Update a oracle pair's price if needed (i.e. when TWAP period elapsed)
     * @param _token The key token of a pair
     * @return true if price was updated or false if TWAP period hasn't elapsed yet
     */
    function _updateIfNeeded(address _token) private returns (bool) {
        if (_token == WETH) return false;

        PairOracleData storage _pairOracle = oracleDataOf[_token];

        address _pair = UniswapV2Library.pairFor(factory, _pairOracle.token0, _pairOracle.token1);

        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = UniswapV2OracleLibrary
            .currentCumulativePrices(_pair);
        uint32 timeElapsed = blockTimestamp - _pairOracle.blockTimestampLast; // overflow is desired

        // ensure that at least one full period has passed since the last update
        if (timeElapsed < twapPeriod) return false;

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        _pairOracle.price0Average = FixedPoint.uq112x112(
            uint224((price0Cumulative - _pairOracle.price0CumulativeLast) / timeElapsed)
        );
        _pairOracle.price1Average = FixedPoint.uq112x112(
            uint224((price1Cumulative - _pairOracle.price1CumulativeLast) / timeElapsed)
        );

        _pairOracle.price0CumulativeLast = price0Cumulative;
        _pairOracle.price1CumulativeLast = price1Cumulative;
        _pairOracle.blockTimestampLast = blockTimestamp;

        return true;
    }

    function _decode(bytes memory _encodedTokenAddress) private pure returns (address _token) {
        _token = abi.decode(_encodedTokenAddress, (address));
    }

    /**
     * @notice Update a oracle pair's price
     * @dev Will create the pair if it doesn't exist
     * @dev This function also update the default USDTOKEN:WETH pair
     * @param _encodedTokenAddress The asset's encoded address
     */
    function update(bytes memory _encodedTokenAddress) public override {
        address _token = _decode(_encodedTokenAddress);

        if (!_hasOracleData(_token)) {
            _addOracleForEthAnd(_token);
        }

        _updateIfNeeded(_token);
        _updateIfNeeded(usdToken);
    }

    /**
     * @notice Convert amounts using am oracle's pair
     * @dev  this will always return 0 before update has been called successfully for the first time.
     * @param _token The key token of a pair
     * @param _tokenIn The token to convert from
     * @param _amountIn The input amount
     * @return _amountOut The output amount
     */
    function _getAmountOut(
        address _token,
        address _tokenIn,
        uint256 _amountIn
    ) private view returns (uint256 _amountOut) {
        PairOracleData memory _pairOracle = oracleDataOf[_token];

        if (_tokenIn == _pairOracle.token0) {
            _amountOut = _pairOracle.price0Average.mul(_amountIn).decode144();
        } else {
            require(_tokenIn == _pairOracle.token1, "invalid-token");
            _amountOut = _pairOracle.price1Average.mul(_amountIn).decode144();
        }
    }

    /**
     * @notice Convert asset's amount to USD
     * @param _encodedTokenAddress The asset's encoded address
     * @param _amount The amount to convert
     * @return _amountInUsd The amount in USD (8 decimals)
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function convertToUsd(bytes memory _encodedTokenAddress, uint256 _amount)
        external
        view
        override
        returns (uint256 _amountInUsd, uint256 _lastUpdatedAt)
    {
        address _token = _decode(_encodedTokenAddress);
        uint256 _ethAmount = _token == WETH ? _amount : _getAmountOut(_token, _token, _amount);
        _amountInUsd = OracleHelpers.normalizeUsdOutput(usdToken, _getAmountOut(usdToken, WETH, _ethAmount));
        _lastUpdatedAt = oracleDataOf[usdToken].blockTimestampLast;
    }

    /**
     * @notice Convert USD to asset's amount
     * @param _encodedTokenAddress The asset's encoded address
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The converted amount
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function convertFromUsd(bytes memory _encodedTokenAddress, uint256 _amountInUsd)
        external
        view
        override
        returns (uint256 _amount, uint256 _lastUpdatedAt)
    {
        address _token = _decode(_encodedTokenAddress);
        uint256 _ethAmount = _getAmountOut(usdToken, usdToken, OracleHelpers.normalizeUsdInput(usdToken, _amountInUsd));
        _amount = _token == WETH ? _ethAmount : _getAmountOut(_token, WETH, _ethAmount);
        _lastUpdatedAt = oracleDataOf[usdToken].blockTimestampLast;
    }
}
