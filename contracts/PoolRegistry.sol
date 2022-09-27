// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./lib/WadRayMath.sol";
import "./storage/PoolRegistryStorage.sol";
import "./interfaces/IPool.sol";
import "./Pausable.sol";

/**
 * @title PoolRegistry contract
 */
contract PoolRegistry is ReentrancyGuard, Pausable, PoolRegistryStorageV1 {
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when fee collector is updated
    event FeeCollectorUpdated(address indexed oldFeeCollector, address indexed newFeeCollector);

    /// @notice Emitted when a pool is registered
    event PoolRegistered(address pool);

    /// @notice Emitted when a pool is unregistered
    event PoolUnregistered(address pool);

    /// @notice Emitted when swap fee is updated
    event SwapFeeUpdated(uint256 oldSwapFee, uint256 newSwapFee);

    /// @notice Emitted when master oracle contract is updated
    event MasterOracleUpdated(IMasterOracle indexed oldOracle, IMasterOracle indexed newOracle);

    /// @notice Emitted when synthetic token is swapped
    event SyntheticTokenSwapped(
        address indexed account,
        ISyntheticToken indexed syntheticTokenIn,
        ISyntheticToken indexed syntheticTokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    /**
     * @dev Throws if synthetic token doesn't exist
     */
    modifier onlyIfSyntheticTokenExists(ISyntheticToken syntheticToken_) {
        require(isSyntheticTokenExists(syntheticToken_), "synthetic-inexistent");
        _;
    }

    function initialize(IMasterOracle masterOracle_, address feeCollector_) public initializer {
        require(address(masterOracle_) != address(0), "oracle-is-null");
        require(feeCollector_ != address(0), "fee-collector-is-null");

        __Governable_init();

        masterOracle = masterOracle_;
        feeCollector = feeCollector_;

        swapFee = 6e15; // 0.6%
    }

    /**
     * @notice Check if token is part of the synthetic offerings
     * @param syntheticToken_ Asset to check
     * @return true if exist
     */
    function isSyntheticTokenExists(ISyntheticToken syntheticToken_) public view override returns (bool) {
        uint256 _length = pools.length();
        for (uint256 i; i < _length; ++i) {
            if (IPool(pools.at(i)).isSyntheticTokenExists(syntheticToken_)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Check if pool is registered
     * @param pool_ Pool to check
     * @return true if exists
     */
    function poolExists(address pool_) public view returns (bool) {
        return pools.contains(pool_);
    }

    /**
     * @notice Get all pools
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getPools() external view returns (address[] memory) {
        return pools.values();
    }

    /**
     * @notice Register pool
     */
    function registerPool(address pool_) external onlyGovernor {
        require(pool_ != address(0), "address-is-null");
        require(pools.add(pool_), "already-registered");
        emit PoolRegistered(pool_);
    }

    /**
     * @notice Unregister pool
     */
    function unregisterPool(address pool_) external onlyGovernor {
        require(pools.remove(pool_), "not-registered");
        emit PoolUnregistered(pool_);
    }

    /**
     * @notice Swap synthetic tokens
     * @param syntheticTokenIn_ Synthetic token to sell
     * @param syntheticTokenOut_ Synthetic token to buy
     * @param amountIn_ Amount to swap
     */
    function swap(
        ISyntheticToken syntheticTokenIn_,
        ISyntheticToken syntheticTokenOut_,
        uint256 amountIn_
    )
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfSyntheticTokenExists(syntheticTokenIn_)
        onlyIfSyntheticTokenExists(syntheticTokenOut_)
        returns (uint256 _amountOut)
    {
        require(amountIn_ > 0 && amountIn_ <= syntheticTokenIn_.balanceOf(msg.sender), "amount-in-is-invalid");
        syntheticTokenIn_.burn(msg.sender, amountIn_);

        _amountOut = masterOracle.quote(address(syntheticTokenIn_), address(syntheticTokenOut_), amountIn_);

        uint256 _feeAmount;
        if (swapFee > 0) {
            _feeAmount = _amountOut.wadMul(swapFee);
            syntheticTokenOut_.mint(feeCollector, _feeAmount);
            _amountOut -= _feeAmount;
        }

        syntheticTokenOut_.mint(msg.sender, _amountOut);

        emit SyntheticTokenSwapped(
            msg.sender,
            syntheticTokenIn_,
            syntheticTokenOut_,
            amountIn_,
            _amountOut,
            _feeAmount
        );
    }

    /**
     * @notice OnlyGovernor:: Update fee collector
     */
    function updateFeeCollector(address newFeeCollector_) external onlyGovernor {
        require(newFeeCollector_ != address(0), "fee-collector-is-null");
        address _currentFeeCollector = feeCollector;
        require(newFeeCollector_ != _currentFeeCollector, "new-same-as-current");
        emit FeeCollectorUpdated(_currentFeeCollector, newFeeCollector_);
        feeCollector = newFeeCollector_;
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(uint256 newSwapFee_) external override onlyGovernor {
        require(newSwapFee_ <= 1e18, "max-is-100%");
        uint256 _currentSwapFee = swapFee;
        require(newSwapFee_ != _currentSwapFee, "new-same-as-current");
        emit SwapFeeUpdated(_currentSwapFee, newSwapFee_);
        swapFee = newSwapFee_;
    }

    /**
     * @notice Update master oracle contract
     */
    function updateMasterOracle(IMasterOracle newMasterOracle_) external override onlyGovernor {
        require(address(newMasterOracle_) != address(0), "address-is-null");
        IMasterOracle _currentMasterOracle = masterOracle;
        require(newMasterOracle_ != _currentMasterOracle, "new-same-as-current");

        emit MasterOracleUpdated(_currentMasterOracle, newMasterOracle_);
        masterOracle = newMasterOracle_;
    }
}
