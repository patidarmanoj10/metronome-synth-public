// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "../access/Governable.sol";
import "../interface/oracle/IOracle.sol";
import "../interface/oracle/IPriceProvider.sol";

/**
 * @title Oracle contract that encapsulates 3rd-party protocols' oracles
 */
contract DefaultOracle is IOracle, Governable {
    uint256 public constant ONE_USD = 1e8;

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
        uint256 stalePeriod; // it's used to determine if a price is invalid (i.e. outdated)
    }

    /**
     * @notice Avaliable assets
     */
    mapping(IERC20 => Asset) public assets;

    /**
     * @notice Get the price provider contract for each protocol
     */
    mapping(Protocol => IPriceProvider) public providerByProtocol;

    /// @notice Emitted when a price provider is updated
    event PriceProviderUpdated(Protocol protocol, IPriceProvider oldPriceProvider, IPriceProvider newPriceProvider);

    /// @notice Emitted when asset setup is updated
    event AssetUpdated(IERC20 indexed asset, Protocol protocol, bytes assetData, bool isUsd, uint256 stalePeriod);

    /**
     * @dev Throws if the asset isn't avaliable
     */
    modifier onlyIfAssetHasPriceProvider(IERC20 _asset) {
        require(assets[_asset].isUsd || assets[_asset].protocol != Protocol.NONE, "asset-has-no-price-provider");
        _;
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
        require(address(_priceProvider) != address(0), "provider-address-null");
        IPriceProvider _currentPriceProvider = providerByProtocol[_protocol];
        require(_priceProvider != _currentPriceProvider, "new-same-as-current");
        providerByProtocol[_protocol] = _priceProvider;
        emit PriceProviderUpdated(_protocol, _currentPriceProvider, _priceProvider);
    }

    /**
     * @notice Check if a price timestamp is outdated
     * @param _timeOfLastUpdate The price timestamp
     * @return true if  price is stale (outdated)
     */
    function _priceIsStale(IERC20 _asset, uint256 _timeOfLastUpdate) private view returns (bool) {
        return block.timestamp - _timeOfLastUpdate > assets[_asset].stalePeriod;
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
        bool _isUsd,
        uint256 _stalePeriod
    ) private {
        require(address(_asset) != address(0), "asset-address-is-null");
        assets[_asset] = Asset({protocol: _protocol, assetData: _assetData, isUsd: _isUsd, stalePeriod: _stalePeriod});
        emit AssetUpdated(_asset, _protocol, _assetData, _isUsd, _stalePeriod);
    }

    /**
     * @notice Store an USD asset (no protocol)
     * @param _asset The asset to store
     */
    function addOrUpdateUsdAsset(IERC20 _asset) external onlyGovernor {
        _addOrUpdateAsset(_asset, Protocol.NONE, new bytes(0), true, type(uint256).max);
    }

    /**
     * @notice Store an asset that uses Chainlink source of price
     * @param _asset The asset to store
     * @param _aggregator The asset's chainlink aggregator contract
     * @param _stalePeriod The stale period
     */
    function addOrUpdateAssetThatUsesChainlink(
        IERC20Metadata _asset,
        address _aggregator,
        uint256 _stalePeriod
    ) external onlyGovernor {
        // Note: Keeping this check here because we call the `_asset.decimals()` function before calling `_addOrUpdateAsset`
        require(address(_asset) != address(0), "asset-address-is-null");
        require(address(_aggregator) != address(0), "aggregator-address-is-null");
        _addOrUpdateAsset(_asset, Protocol.CHAINLINK, abi.encode(_aggregator, _asset.decimals()), false, _stalePeriod);
    }

    /**
     * @notice Store an asset that uses UniswapV2 source of price
     * @param _asset The asset to store
     * @param _underlying The actual asset to get prices from (e.g. vsETH uses WETH)
     * @param _stalePeriod The stale period
     */
    function addOrUpdateAssetThatUsesUniswapV2(
        IERC20 _asset,
        IERC20 _underlying,
        uint256 _stalePeriod
    ) external onlyGovernor {
        require(address(_underlying) != address(0), "underlying-address-is-null");
        _addOrUpdateAsset(_asset, Protocol.UNISWAP_V2, abi.encode(_underlying), false, _stalePeriod);
    }

    /**
     * @notice Store an asset that uses UniswapV3 source of price
     * @dev This function is also used for update a asset setup
     * @param _asset The asset to store
     * @param _underlying The actual asset to get prices from (e.g. vsETH uses WETH)
     */
    function addOrUpdateAssetThatUsesUniswapV3(IERC20 _asset, IERC20 _underlying) external onlyGovernor {
        require(address(_underlying) != address(0), "underlying-address-is-null");
        _addOrUpdateAsset(_asset, Protocol.UNISWAP_V3, abi.encode(_underlying), false, type(uint256).max);
    }

    /**
     * @notice Update a asset's price
     * @param _asset The asset to update
     */
    // solhint-disable-next-line no-empty-blocks
    function update(IERC20 _asset) external {
        if (assets[_asset].protocol != Protocol.NONE) {
            _priceProviderOfAsset(_asset).update(_dataOfAsset(_asset));
        }
    }

    /**
     * @notice Get asset's USD price
     * @param _asset The asset's to get price from
     * @return _priceInUsd The amount in USD (8 decimals)
     */
    function getPriceInUsd(IERC20 _asset)
        external
        view
        onlyIfAssetHasPriceProvider(_asset)
        returns (uint256 _priceInUsd)
    {
        if (assets[_asset].isUsd) return ONE_USD;

        uint256 _lastUpdatedAt;
        (_priceInUsd, _lastUpdatedAt) = _priceProviderOfAsset(_asset).getPriceInUsd(_dataOfAsset(_asset));
        require(!_priceIsStale(_asset, _lastUpdatedAt), "price-is-stale");
    }
}
