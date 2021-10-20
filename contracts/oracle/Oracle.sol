// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "../access/Governable.sol";
import "../interface/oracle/IOracle.sol";
import "../interface/oracle/IPriceProvider.sol";

/**
 * @title Oracle contract that encapsulates 3rd-party protocols' oracles
 */
contract Oracle is IOracle, Governable {
    /**
     * @notice The supported protocols
     */
    enum Protocol {
        NONE,
        UNISWAP_V3,
        UNISWAP_V2,
        CHAINLINK
    }

    /**
     * @notice Asset's oracle setup
     * @dev I.e. maps the oracle used by each asset
     */
    struct Asset {
        Protocol protocol;
        bytes assetData; // encoded data used for queries on price providers
        bool isUsd; // i.e. when true no oracle query is needed (amountOut = amountIn)
    }

    /**
     * @notice Avaliable assets
     */
    mapping(IERC20 => Asset) public assets;

    /**
     * @notice Get the price provider contract for each protocol
     */
    mapping(Protocol => IPriceProvider) public providerByProtocol;

    /**
     * @notice The stale period
     * @dev It's used to determine if a price is invalid (i.e. outdated)
     */
    uint256 public stalePeriod;

    /// @notice Emitted when a price provider is updated
    event PriceProviderUpdated(Protocol protocol, IPriceProvider oldPriceProvider, IPriceProvider newPriceProvider);

    /// @notice Emitted when stale period is updated
    event StalePeriodUpdated(uint256 oldStalePeriod, uint256 newStalePeriod);

    /// @notice Emitted when asset setup is updated
    event AssetUpdated(IERC20 indexed asset, Protocol protocol, bytes assetData, bool isUsd);

    /**
     * @dev Throws if the asset isn't avaliable
     */
    modifier onlyIfAssetHasPriceProvider(IERC20 _asset) {
        require(assets[_asset].isUsd || assets[_asset].protocol != Protocol.NONE, "asset-has-no-price-provider");
        _;
    }

    /**
     * @dev Calls the update routine of an asset's price providers
     * @dev I.e. Only Uniswap V2 price provider has the update function implemented
     */
    modifier updatePriceProviderIfNeeded(IERC20 _asset) {
        if (assets[_asset].protocol != Protocol.NONE) {
            _priceProviderOfAsset(_asset).update(_dataOfAsset(_asset));
        }
        _;
    }

    constructor(uint256 _stalePeriod) {
        stalePeriod = _stalePeriod;
    }

    /**
     * @dev Get the price provider contract of an asset
     */
    function _priceProviderOfAsset(IERC20 _asset) private view returns (IPriceProvider) {
        return providerByProtocol[assets[_asset].protocol];
    }

    /**
     * @dev Get encoded data of an asset
     */
    function _dataOfAsset(IERC20 _asset) private view returns (bytes memory) {
        return assets[_asset].assetData;
    }

    /**
     * @notice Set the price provider of a protocol
     * @dev This function is also used for update a price provider
     * @param _protocol The protocol
     * @param _priceProvider The price provider protocol
     */
    function setPriceProvider(Protocol _protocol, IPriceProvider _priceProvider) external onlyGovernor {
        require(address(_priceProvider) != address(0), "price-provider-address-null");
        emit PriceProviderUpdated(_protocol, providerByProtocol[_protocol], _priceProvider);
        providerByProtocol[_protocol] = _priceProvider;
    }

    /**
     * @notice Update stale period
     * @param _newStalePeriod The new period
     */
    function updateStalePeriod(uint256 _newStalePeriod) external onlyGovernor {
        require(_newStalePeriod != stalePeriod, "stale-period-same-as-current");
        emit StalePeriodUpdated(stalePeriod, _newStalePeriod);
        stalePeriod = _newStalePeriod;
    }

    /**
     * @notice Check if a price timestamp is outdated
     * @param _timeOfLastUpdate The price timestamp
     * @return true if  price is stale (outdated)
     */
    function _priceIsStale(uint256 _timeOfLastUpdate) private view returns (bool) {
        return block.timestamp - _timeOfLastUpdate > stalePeriod;
    }

    /**
     * @notice Store an asset
     * @param _asset The asset to store
     * @param _protocol The protocol to use as source of price
     * @param _assetData The asset's encoded data
     * @param _isUsd If the asset is a USD token coin
     */
    function _addOrUpdateAsset(
        IERC20 _asset,
        Protocol _protocol,
        bytes memory _assetData,
        bool _isUsd
    ) private {
        require(address(_asset) != address(0), "asset-address-is-null");
        assets[_asset] = Asset({protocol: _protocol, assetData: _assetData, isUsd: _isUsd});
        emit AssetUpdated(_asset, _protocol, _assetData, _isUsd);
    }

    /**
     * @notice Store an USD asset (no protocol)
     * @param _asset The asset to store
     */
    function addOrUpdateUsdAsset(IERC20 _asset) external onlyGovernor {
        _addOrUpdateAsset(_asset, Protocol.NONE, new bytes(0), true);
    }

    /**
     * @notice Store an asset that uses Chainlink source of price
     * @param _asset The asset to store
     * @param _aggregator The asset's chainlink aggregator contract
     */
    function addOrUpdateAssetThatUsesChainlink(IERC20Metadata _asset, address _aggregator) external onlyGovernor {
        require(address(_asset) != address(0), "asset-address-is-null");
        require(address(_aggregator) != address(0), "aggregator-address-is-null");
        _addOrUpdateAsset(_asset, Protocol.CHAINLINK, abi.encode(_aggregator, _asset.decimals()), false);
    }

    /**
     * @notice Store an asset that uses UniswapV2 source of price
     * @param _asset The asset to store
     * @param _underlying The actual asset to get prices from (e.g. mETH uses WETH)
     */
    function addOrUpdateAssetThatUsesUniswapV2(IERC20 _asset, IERC20 _underlying) external onlyGovernor {
        require(address(_underlying) != address(0), "underlying-address-is-null");
        _addOrUpdateAsset(_asset, Protocol.UNISWAP_V2, abi.encode(_underlying), false);
    }

    /**
     * @notice Store an asset that uses UniswapV3 source of price
     * @dev This function is also used for update a asset setup
     * @param _asset The asset to store
     * @param _underlying The actual asset to get prices from (e.g. mETH uses WETH)
     */
    function addOrUpdateAssetThatUsesUniswapV3(IERC20 _asset, IERC20 _underlying) external onlyGovernor {
        require(address(_underlying) != address(0), "underlying-address-is-null");
        _addOrUpdateAsset(_asset, Protocol.UNISWAP_V3, abi.encode(_underlying), false);
    }

    /**
     * @notice Update a asset's price
     * @param _asset The asset to update
     */
    // solhint-disable-next-line no-empty-blocks
    function update(IERC20 _asset) public updatePriceProviderIfNeeded(_asset) {}

    /**
     * @notice Convert asset's amount to USD
     * @param _asset The asset's address
     * @param _amount The amount to convert
     * @return _amountInUsd The amount in USD (8 decimals)
     * @return _priceInvalid True if price is outdated and/or invalid
     */
    function convertToUsdUsingLatestPrice(IERC20 _asset, uint256 _amount)
        public
        view
        onlyIfAssetHasPriceProvider(_asset)
        returns (uint256 _amountInUsd, bool _priceInvalid)
    {
        if (assets[_asset].isUsd) return (_amount, false);

        uint256 _lastUpdatedAt;
        (_amountInUsd, _lastUpdatedAt) = _priceProviderOfAsset(_asset).convertToUsd(_dataOfAsset(_asset), _amount);
        _priceInvalid = _amountInUsd == 0 || _priceIsStale(_lastUpdatedAt);
    }

    /**
     * @notice Convert USD to asset's amount
     * @param _asset The asset's address
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The converted amount
     * @return _priceInvalid True if price is outdated and/or invalid
     */
    function convertFromUsdUsingLatestPrice(IERC20 _asset, uint256 _amountInUsd)
        public
        view
        onlyIfAssetHasPriceProvider(_asset)
        returns (uint256 _amount, bool _priceInvalid)
    {
        if (assets[_asset].isUsd) return (_amountInUsd, false);

        uint256 _lastUpdatedAt;
        (_amount, _lastUpdatedAt) = _priceProviderOfAsset(_asset).convertFromUsd(_dataOfAsset(_asset), _amountInUsd);
        _priceInvalid = _amount == 0 || _priceIsStale(_lastUpdatedAt);
    }

    /**
     * @notice Convert assets' amounts
     * @param _assetIn The asset to convert from
     * @param _assetOut The asset to convert to
     * @param _amountIn The amount to convert from
     * @return _amountOut The converted amount
     * @return _priceInvalid True if price is outdated and/or invalid
     */
    function convertUsingLatestPrice(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) external view returns (uint256 _amountOut, bool _priceInvalid) {
        (uint256 _amountInUsd, bool _price0Invalid) = convertToUsdUsingLatestPrice(_assetIn, _amountIn);
        bool _price1Invalid;
        (_amountOut, _price1Invalid) = convertFromUsdUsingLatestPrice(_assetOut, _amountInUsd);
        _priceInvalid = _price0Invalid || _price1Invalid;
    }

    /**
     * @notice Convert asset's amount to USD
     * @dev Revert if price is invalid
     * @param _asset The asset's address
     * @param _amount The amount to convert
     * @return _amountInUsd The amount in USD (8 decimals)
     */
    function convertToUsd(IERC20 _asset, uint256 _amount)
        public
        onlyIfAssetHasPriceProvider(_asset)
        updatePriceProviderIfNeeded(_asset)
        returns (uint256 _amountInUsd)
    {
        bool _priceInvalid;
        (_amountInUsd, _priceInvalid) = convertToUsdUsingLatestPrice(_asset, _amount);
        require(!_priceInvalid, "price-is-invalid");
    }

    /**
     * @notice Convert USD to asset's amount
     * @dev Revert if price is invalid
     * @param _asset The asset's address
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The converted amount
     */
    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd)
        public
        onlyIfAssetHasPriceProvider(_asset)
        updatePriceProviderIfNeeded(_asset)
        returns (uint256 _amount)
    {
        bool _priceInvalid;
        (_amount, _priceInvalid) = convertFromUsdUsingLatestPrice(_asset, _amountInUsd);
        require(!_priceInvalid, "price-is-invalid");
    }

    /**
     * @notice Convert assets' amounts
     * @dev Revert if price is invalid
     * @param _priceProvider The price provider
     * @param _assetIn The asset to convert from
     * @param _assetOut The asset to convert to
     * @param _amountIn The amount to convert from
     * @return _amountOut The converted amount
     */
    function _convertUsingTheSamePriceProvider(
        IPriceProvider _priceProvider,
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    )
        private
        onlyIfAssetHasPriceProvider(_assetIn)
        updatePriceProviderIfNeeded(_assetIn)
        onlyIfAssetHasPriceProvider(_assetOut)
        updatePriceProviderIfNeeded(_assetOut)
        returns (uint256 _amountOut)
    {
        (_amountOut, ) = _priceProvider.convert(_dataOfAsset(_assetIn), _dataOfAsset(_assetOut), _amountIn);
    }

    /**
     * @notice Convert assets' amounts
     * @dev Revert if price is invalid
     * @param _assetIn The asset to convert from
     * @param _assetOut The asset to convert to
     * @param _amountIn The amount to convert from
     * @return _amountOut The converted amount
     */
    function convert(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut) {
        IPriceProvider _inPriceProvider = _priceProviderOfAsset(_assetIn);
        if (_inPriceProvider == _priceProviderOfAsset(_assetOut)) {
            _amountOut = _convertUsingTheSamePriceProvider(_inPriceProvider, _assetIn, _assetOut, _amountIn);
        } else {
            uint256 _amountInUsd = convertToUsd(_assetIn, _amountIn);
            _amountOut = convertFromUsd(_assetOut, _amountInUsd);
        }
    }
}
