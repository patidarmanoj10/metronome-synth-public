// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../access/Governable.sol";
import "../interface/oracle/IUniswapV3CrossPoolOracle.sol";
import "../interface/oracle/IPriceProvider.sol";
import "../lib/OracleHelpers.sol";

/**
 * @title UniswapV3 Oracle contract
 * @dev The UniswapV3CrossPoolOracle uses 0.3% fee pool as default
 * @dev The `assetToAsset` function uses token->weth->usdToken under the hoods
 */
contract UniswapV3PriceProvider is IPriceProvider, Governable {
    /**
     * @notice The UniswapV3CrossPoolOracle contract address
     * @dev This is 3rd-party non-upgradable contract
     * @dev The address isn't hardcoded because we may want to deploy mBOX to other chains
     * See more: https://etherscan.io/address/0x0f1f5a87f99f0918e6c81f16e59f3518698221ff#code
     */
    IUniswapV3CrossPoolOracle public crossPoolOracle;

    /**
     * @notice The USD token (stable coin) to use to convert amounts to/from USD
     * @dev This contract supports tokens with any decimals (e.g. USDC, DAI)
     */
    address public usdToken;

    /**
     * @notice The time-weighted average price (TWAP) period
     * @dev See more: https://docs.uniswap.org/protocol/concepts/V3-overview/oracle
     */
    uint32 public twapPeriod;

    /// @notice Emitted when TWAP period is updated
    event TwapPeriodUpdated(uint32 oldTwapPeriod, uint32 newTwapPeriod);

    constructor(
        IUniswapV3CrossPoolOracle _crossPoolOracle,
        address _usdToken,
        uint32 _twapPeriod
    ) {
        require(address(_crossPoolOracle) != address(0), "null-cross0pool-oracle-address");
        require(_usdToken != address(0), "null-usd-token-address");
        crossPoolOracle = _crossPoolOracle;
        usdToken = _usdToken;
        twapPeriod = _twapPeriod;
    }

    /**
     * @notice Update TWAP period
     * @param _newTwapPeriod The new period
     */
    function updateTwapPeriod(uint32 _newTwapPeriod) public onlyGovernor {
        emit TwapPeriodUpdated(twapPeriod, _newTwapPeriod);
        twapPeriod = _newTwapPeriod;
    }

    /**
     * @notice Decode asset data
     * @param _encodedTokenAddress The asset's encoded address
     * @return _token The asset's address
     */
    function _decode(bytes memory _encodedTokenAddress) private pure returns (address _token) {
        _token = abi.decode(_encodedTokenAddress, (address));
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
        _amountInUsd = OracleHelpers.normalizeUsdOutput(
            usdToken,
            crossPoolOracle.assetToAsset(_decode(_encodedTokenAddress), _amount, usdToken, twapPeriod)
        );
        _lastUpdatedAt = block.timestamp;
    }

    /**
     * @notice Convert USD to asset's amount
     * @param _encodedTokenAddress The asset's encoded address
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The amount to convert
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function convertFromUsd(bytes memory _encodedTokenAddress, uint256 _amountInUsd)
        external
        view
        override
        returns (uint256 _amount, uint256 _lastUpdatedAt)
    {
        _amount = crossPoolOracle.assetToAsset(
            usdToken,
            OracleHelpers.normalizeUsdInput(usdToken, _amountInUsd),
            _decode(_encodedTokenAddress),
            twapPeriod
        );
        _lastUpdatedAt = block.timestamp;
    }

    /**
     * @dev This function is here just to follow IPriceProvider
     */
    // solhint-disable-next-line no-empty-blocks
    function update(bytes memory) external {}

    /**
     * @notice Convert two assets' amounts
     * @param _encodedTokenInAddress The input asset's encoded address
     * @param _encodedTokenOutAddress  The output asset's encoded address
     * @param _amountIn The amount in
     * @return _amountOut The amout out
     * @return _lastUpdatedAt The timestamp of the price used to convert
     */
    function consult(
        bytes memory _encodedTokenInAddress,
        bytes memory _encodedTokenOutAddress,
        uint256 _amountIn
    ) public view returns (uint256 _amountOut, uint256 _lastUpdatedAt) {
        address _tokenIn = _decode(_encodedTokenInAddress);
        address _tokenOut = _decode(_encodedTokenOutAddress);

        _amountOut = crossPoolOracle.assetToAsset(_tokenIn, _amountIn, _tokenOut, twapPeriod);
        _lastUpdatedAt = block.timestamp;
    }
}
