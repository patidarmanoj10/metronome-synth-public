// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./utils/ReentrancyGuard.sol";
import "./lib/WadRayMath.sol";
import "./storage/PoolRegistryStorage.sol";
import "./interfaces/IPool.sol";
import "./utils/Pauseable.sol";

error AddressIsNull();
error OracleIsNull();
error FeeCollectorIsNull();
error NativeTokenGatewayIsNull();
error AlreadyRegistered();
error UnregisteredPool();
error NewValueIsSameAsCurrent();

/**
 * @title PoolRegistry contract
 */
contract PoolRegistry is ReentrancyGuard, Pauseable, PoolRegistryStorageV2 {
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    string public constant VERSION = "1.2.0";

    /// @notice Emitted when fee collector is updated
    event FeeCollectorUpdated(address indexed oldFeeCollector, address indexed newFeeCollector);

    /// @notice Emitted when Lz base gas limit updated
    event LzBaseGasLimitUpdated(uint256 oldLzBaseGasLimit, uint256 newLzBaseGasLimit);

    /// @notice Emitted when master oracle contract is updated
    event MasterOracleUpdated(IMasterOracle indexed oldOracle, IMasterOracle indexed newOracle);

    /// @notice Emitted when native token gateway is updated
    event NativeTokenGatewayUpdated(address indexed oldGateway, address indexed newGateway);

    /// @notice Emitted when a pool is registered
    event PoolRegistered(uint256 indexed id, address indexed pool);

    /// @notice Emitted when a pool is unregistered
    event PoolUnregistered(uint256 indexed id, address indexed pool);

    /// @notice Emitted when Stargate router is updated
    event StargateRouterUpdated(IStargateRouter oldStargateRouter, IStargateRouter newStargateRouter);

    /// @notice Emitted when Stargate pool id is updated
    event StargatePoolIdUpdated(address indexed token, uint256 oldPoolId, uint256 newPoolId);

    /// @notice Emitted when Stargate slippage is updated
    event StargateSlippageUpdated(uint256 oldStargateSlippage, uint256 newStargateSlippage);

    /// @notice Emitted when Swapper contract is updated
    event SwapperUpdated(ISwapper oldSwapFee, ISwapper newSwapFee);

    /// @notice Emitted when Quoter contract is updated
    event QuoterUpdated(IQuoter oldQuoter, IQuoter newQuoter);

    /// @notice Emitted when LZ mainnet chain id is updated
    event LzMainnetChainIdUpdated(uint16 oldLzMainnetChainId, uint16 newLzMainnetChainId);

    event LeverageSwapTxGasLimitUpdated(uint64 currentLeverageSwapTxGasLimit, uint64 newLeverageSwapTxGasLimit);
    event LeverageCallbackTxGasLimitUpdated(
        uint64 currentLeverageCallbackTxGasLimit,
        uint64 newLeverageCallbackTxGasLimit
    );
    event FlashRepaySwapTxGasLimitUpdated(uint64 currentFlashRepaySwapTxGasLimit, uint64 newFlashRepaySwapTxGasLimit);
    event FlashRepayCallbackTxGasLimitUpdated(
        uint64 currentFlashRepayCallbackTxGasLimit,
        uint64 newFlashRepayCallbackTxGasLimit
    );

    function initialize(IMasterOracle masterOracle_, address feeCollector_) external initializer {
        if (address(masterOracle_) == address(0)) revert OracleIsNull();
        if (feeCollector_ == address(0)) revert FeeCollectorIsNull();

        __ReentrancyGuard_init();
        __Pauseable_init();

        masterOracle = masterOracle_;
        feeCollector = feeCollector_;

        nextPoolId = 1;
        stargateSlippage = 10; // 0.1%
        lzBaseGasLimit = 200_00;
        flashRepayCallbackTxGasLimit = 750_000;
        flashRepaySwapTxGasLimit = 500_000;
        leverageCallbackTxGasLimit = 750_000;
        leverageSwapTxGasLimit = 650_000;
        lzMainnetChainId = 101;
    }

    /**
     * @notice Get all pools
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getPools() external view override returns (address[] memory) {
        return pools.values();
    }

    /**
     * @notice Check if pool is registered
     * @param pool_ Pool to check
     * @return true if exists
     */
    function isPoolRegistered(address pool_) external view override returns (bool) {
        return pools.contains(pool_);
    }

    /**
     * @notice Register pool
     */
    function registerPool(address pool_) external override onlyGovernor {
        if (pool_ == address(0)) revert AddressIsNull();
        if (!pools.add(pool_)) revert AlreadyRegistered();
        uint256 _id = idOfPool[pool_];
        if (_id == 0) {
            _id = nextPoolId++;
            idOfPool[pool_] = _id;
        }
        emit PoolRegistered(_id, pool_);
    }

    /**
     * @notice Unregister pool
     */
    function unregisterPool(address pool_) external override onlyGovernor {
        if (!pools.remove(pool_)) revert UnregisteredPool();
        emit PoolUnregistered(idOfPool[pool_], pool_);
    }

    /**
     * @notice Update fee collector
     */
    function updateFeeCollector(address newFeeCollector_) external override onlyGovernor {
        if (newFeeCollector_ == address(0)) revert FeeCollectorIsNull();
        address _currentFeeCollector = feeCollector;
        if (newFeeCollector_ == _currentFeeCollector) revert NewValueIsSameAsCurrent();
        emit FeeCollectorUpdated(_currentFeeCollector, newFeeCollector_);
        feeCollector = newFeeCollector_;
    }

    /**
     * @notice Update flash repay callback tx gas limit
     */
    function updateFlashRepayCallbackTxGasLimit(uint64 newFlashRepayCallbackTxGasLimit_) external onlyGovernor {
        uint64 _currentFlashRepayCallbackTxGasLimit = flashRepayCallbackTxGasLimit;
        if (newFlashRepayCallbackTxGasLimit_ == _currentFlashRepayCallbackTxGasLimit) revert NewValueIsSameAsCurrent();
        emit FlashRepayCallbackTxGasLimitUpdated(
            _currentFlashRepayCallbackTxGasLimit,
            newFlashRepayCallbackTxGasLimit_
        );
        flashRepayCallbackTxGasLimit = newFlashRepayCallbackTxGasLimit_;
    }

    /**
     * @notice Update flash repay swap tx gas limit
     */
    function updateFlashRepaySwapTxGasLimit(uint64 newFlashRepaySwapTxGasLimit_) external onlyGovernor {
        uint64 _currentFlashRepaySwapTxGasLimit = flashRepaySwapTxGasLimit;
        if (newFlashRepaySwapTxGasLimit_ == _currentFlashRepaySwapTxGasLimit) revert NewValueIsSameAsCurrent();
        emit FlashRepaySwapTxGasLimitUpdated(_currentFlashRepaySwapTxGasLimit, newFlashRepaySwapTxGasLimit_);
        flashRepaySwapTxGasLimit = newFlashRepaySwapTxGasLimit_;
    }

    /**
     * @notice Update leverage callback tx gas limit
     */
    function updateLeverageCallbackTxGasLimit(uint64 newLeverageCallbackTxGasLimit_) external onlyGovernor {
        uint64 _currentLeverageCallbackTxGasLimit = leverageCallbackTxGasLimit;
        if (newLeverageCallbackTxGasLimit_ == _currentLeverageCallbackTxGasLimit) revert NewValueIsSameAsCurrent();
        emit LeverageCallbackTxGasLimitUpdated(_currentLeverageCallbackTxGasLimit, newLeverageCallbackTxGasLimit_);
        leverageCallbackTxGasLimit = newLeverageCallbackTxGasLimit_;
    }

    /**
     * @notice Update leverage swap tx gas limit
     */
    function updateLeverageSwapTxGasLimit(uint64 newLeverageSwapTxGasLimit_) external onlyGovernor {
        uint64 _currentSwapTxGasLimit = leverageSwapTxGasLimit;
        if (newLeverageSwapTxGasLimit_ == _currentSwapTxGasLimit) revert NewValueIsSameAsCurrent();
        emit LeverageSwapTxGasLimitUpdated(_currentSwapTxGasLimit, newLeverageSwapTxGasLimit_);
        leverageSwapTxGasLimit = newLeverageSwapTxGasLimit_;
    }

    /**
     * @notice Update Lz base gas limit
     */
    function updateLzBaseGasLimit(uint256 newLzBaseGasLimit_) external onlyGovernor {
        uint256 _currentBaseGasLimit = lzBaseGasLimit;
        if (newLzBaseGasLimit_ == _currentBaseGasLimit) revert NewValueIsSameAsCurrent();
        emit LzBaseGasLimitUpdated(_currentBaseGasLimit, newLzBaseGasLimit_);
        lzBaseGasLimit = newLzBaseGasLimit_;
    }

    /**
     * @notice Update master oracle contract
     */
    function updateMasterOracle(IMasterOracle newMasterOracle_) external onlyGovernor {
        if (address(newMasterOracle_) == address(0)) revert OracleIsNull();
        IMasterOracle _currentMasterOracle = masterOracle;
        if (newMasterOracle_ == _currentMasterOracle) revert NewValueIsSameAsCurrent();
        emit MasterOracleUpdated(_currentMasterOracle, newMasterOracle_);
        masterOracle = newMasterOracle_;
    }

    /**
     * @notice Update native token gateway
     */
    function updateNativeTokenGateway(address newGateway_) external onlyGovernor {
        if (address(newGateway_) == address(0)) revert NativeTokenGatewayIsNull();
        address _currentGateway = nativeTokenGateway;
        if (newGateway_ == _currentGateway) revert NewValueIsSameAsCurrent();
        emit NativeTokenGatewayUpdated(_currentGateway, newGateway_);
        nativeTokenGateway = newGateway_;
    }

    /**
     * @notice Update Stargate pool id of token.
     * @dev Use LZ ids (https://stargateprotocol.gitbook.io/stargate/developers/pool-ids)
     */
    function updateStargatePoolIdOf(address token_, uint256 newPoolId_) external onlyGovernor {
        uint256 _currentPoolId = stargatePoolIdOf[token_];
        if (newPoolId_ == _currentPoolId) revert NewValueIsSameAsCurrent();
        emit StargatePoolIdUpdated(token_, _currentPoolId, newPoolId_);
        stargatePoolIdOf[token_] = newPoolId_;
    }

    /**
     * @notice Update Stargate slippage
     */
    function updateStargateSlippage(uint256 newStargateSlippage_) external onlyGovernor {
        uint256 _currentStargateSlippage = stargateSlippage;
        if (newStargateSlippage_ == _currentStargateSlippage) revert NewValueIsSameAsCurrent();
        emit StargateSlippageUpdated(_currentStargateSlippage, newStargateSlippage_);
        stargateSlippage = newStargateSlippage_;
    }

    /**
     * @notice Update StargateRouter
     */
    function updateStargateRouter(IStargateRouter newStargateRouter_) external onlyGovernor {
        IStargateRouter _currentStargateRouter = stargateRouter;
        if (newStargateRouter_ == _currentStargateRouter) revert NewValueIsSameAsCurrent();
        emit StargateRouterUpdated(_currentStargateRouter, newStargateRouter_);
        stargateRouter = newStargateRouter_;
    }

    /**
     * @notice Update Swapper contract
     */
    function updateSwapper(ISwapper newSwapper_) external onlyGovernor {
        if (address(newSwapper_) == address(0)) revert AddressIsNull();
        ISwapper _currentSwapper = swapper;
        if (newSwapper_ == _currentSwapper) revert NewValueIsSameAsCurrent();

        emit SwapperUpdated(_currentSwapper, newSwapper_);
        swapper = newSwapper_;
    }

    /**
     * @notice Update Quoter contract
     */
    function updateQuoter(IQuoter newQuoter_) external onlyGovernor {
        if (address(newQuoter_) == address(0)) revert AddressIsNull();
        IQuoter _currentQuoter = quoter;
        if (newQuoter_ == _currentQuoter) revert NewValueIsSameAsCurrent();

        emit QuoterUpdated(_currentQuoter, newQuoter_);
        quoter = newQuoter_;
    }

    /**
     * @notice Update LZ mainnet chain id
     */
    function updateLzMainnetChainId(uint16 newLzMainnetChainId_) external onlyGovernor {
        uint16 _currentLzMainnetChainId = lzMainnetChainId;
        if (newLzMainnetChainId_ == _currentLzMainnetChainId) revert NewValueIsSameAsCurrent();
        emit LzMainnetChainIdUpdated(_currentLzMainnetChainId, newLzMainnetChainId_);
        lzMainnetChainId = newLzMainnetChainId_;
    }
}
