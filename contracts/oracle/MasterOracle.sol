// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "../access/Governable.sol";
import "../interface/oracle/IMasterOracle.sol";
import "../interface/oracle/IOracle.sol";

/**
 * @title The Master oracle that is called by `Controller`
 */
contract MasterOracle is Initializable, IMasterOracle, Governable {
    /**
     * @notice Maps asset addresses to oracle contracts
     */
    mapping(address => IOracle) public oracles;

    /**
     * @notice The Default/fallback oracle
     */
    IOracle public defaultOracle;

    /**
     * @notice Event emitted when the default oracle is updated
     */
    event DefaultOracleUpdated(IOracle oldOracle, IOracle newOracle);

    /**
     * @notice Event emitted when a asset's oracle is updated
     */
    event OracleUpdated(address asset, IOracle oldOracle, IOracle newOracle);

    function initialize(
        address[] memory _assets,
        IOracle[] memory _oracles,
        IOracle _defaultOracle
    ) external initializer {
        __Governable_init();

        _updateOracles(_assets, _oracles);
        defaultOracle = _defaultOracle;
    }

    /**
     * @notice Sets `_oracles` for `_assets`.
     * @param _assets The ERC20 asset addresses to link to `_oracles`.
     * @param _oracles The `IOracle` contracts to be assigned to `_assets`.
     * @dev We allow null address inside of the `_oracles` array in order to turn off oracle for a given asset
     */
    function _updateOracles(address[] memory _assets, IOracle[] memory _oracles) private {
        uint256 _assetsLength = _assets.length;
        require(_assetsLength == _oracles.length, "invalid-arrays-length");

        for (uint256 i = 0; i < _assetsLength; i++) {
            address _asset = _assets[i];
            require(_asset != address(0), "an-asset-has-null-address");
            IOracle _currentOracle = oracles[_asset];
            IOracle _newOracle = _oracles[i];
            require(_newOracle != _currentOracle, "a-new-oracle-same-as-current");
            emit OracleUpdated(_asset, _currentOracle, _newOracle);
            oracles[_asset] = _newOracle;
        }
    }

    /**
     * @notice Add or update token oracles
     * @param _assets The ERC20 asset addresses to link to `_oracles`
     * @param _oracles The `IOracle` contracts to be assigned to `_assets`
     */
    function addOrUpdate(address[] calldata _assets, IOracle[] calldata _oracles) external onlyGovernor {
        require(_assets.length > 0 && _oracles.length > 0, "invalid-arrays-length");
        _updateOracles(_assets, _oracles);
    }

    /**
     * @notice Update the default oracle contract
     * @param _newDefaultOracle The new default oracle contract
     * @dev We allow null address in order to turn off the default oracle
     */
    function setDefaultOracle(IOracle _newDefaultOracle) external onlyGovernor {
        IOracle _currentDefaultOracle = defaultOracle;
        require(_newDefaultOracle != _currentDefaultOracle, "new-oracle-is-same-as-current");
        emit DefaultOracleUpdated(_currentDefaultOracle, _newDefaultOracle);
        defaultOracle = _newDefaultOracle;
    }

    /**
     * @notice Get asset's USD price
     * @param _asset The asset's address
     * @return _priceInUsd The USD price (8 decimals)
     */
    function _getPriceInUsd(IERC20 _asset) private view returns (uint256 _priceInUsd) {
        IOracle _oracle = oracles[address(_asset)];

        if (address(_oracle) != address(0)) {
            _priceInUsd = _oracle.getPriceInUsd(_asset);
        } else if (address(defaultOracle) != address(0)) {
            _priceInUsd = defaultOracle.getPriceInUsd(_asset);
        } else {
            revert("asset-without-oracle");
        }

        require(_priceInUsd > 0, "invalid-price");
    }

    /**
     * @notice Convert asset's amount to USD
     * @param _asset The asset's address
     * @param _amount The amount to convert
     * @return _amountInUsd The amount in USD (8 decimals)
     */
    function convertToUsd(IERC20 _asset, uint256 _amount) public view returns (uint256 _amountInUsd) {
        uint256 _priceInUsd = _getPriceInUsd(_asset);
        _amountInUsd = (_amount * _priceInUsd) / 10**IERC20Metadata(address(_asset)).decimals();
    }

    /**
     * @notice Convert USD to asset's amount
     * @param _asset The asset's address
     * @param _amountInUsd The amount in USD (8 decimals)
     * @return _amount The converted amount
     */
    function convertFromUsd(IERC20 _asset, uint256 _amountInUsd) public view returns (uint256 _amount) {
        uint256 _priceInUsd = _getPriceInUsd(_asset);
        _amount = (_amountInUsd * 10**IERC20Metadata(address(_asset)).decimals()) / _priceInUsd;
    }

    /**
     * @notice Convert assets' amounts
     * @param _assetIn The asset to convert from
     * @param _assetOut The asset to convert to
     * @param _amountIn The amount to convert from
     * @return _amountOut The converted amount
     */
    function convert(
        IERC20 _assetIn,
        IERC20 _assetOut,
        uint256 _amountIn
    ) external view returns (uint256 _amountOut) {
        uint256 _amountInUsd = convertToUsd(_assetIn, _amountIn);
        _amountOut = convertFromUsd(_assetOut, _amountInUsd);
    }
}
