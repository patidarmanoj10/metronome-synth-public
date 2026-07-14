// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Initializable} from "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardDeprecated} from "./utils/ReentrancyGuardDeprecated.sol";
import {ReentrancyGuardTransient} from "./utils/ReentrancyGuardTransient.sol";
import {WadRayMath} from "./lib/WadRayMath.sol";
import {PoolRegistryStorageV5} from "./storage/PoolRegistryStorage.sol";
import {IPool} from "./interfaces/IPool.sol";
import {Pauseable} from "./utils/Pauseable.sol";
import {EnumerableSet} from "./dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {IMasterOracle} from "./interfaces/external/IMasterOracle.sol";
import {ISwapper} from "./interfaces/external/ISwapper.sol";
import {IPoolRegistry} from "./interfaces/IPoolRegistry.sol";
import {IOperator} from "./interfaces/IOperator.sol";
import {ISyntheticToken} from "./interfaces/ISyntheticToken.sol";

error AddressIsNull();
error OracleIsNull();
error FeeCollectorIsNull();
error NativeTokenGatewayIsNull();
error AlreadyRegistered();
error UnregisteredPool();
error NewValueIsSameAsCurrent();
error UnregisteredGuardian();

/**
 * @title PoolRegistry contract
 */
contract PoolRegistry is
    Initializable,
    ReentrancyGuardDeprecated,
    ReentrancyGuardTransient,
    Pauseable,
    PoolRegistryStorageV5
{
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    string public constant VERSION = "1.3.2";

    /// @notice Emitted when fee collector is updated
    event FeeCollectorUpdated(address indexed oldFeeCollector, address indexed newFeeCollector);

    /// @notice Emitted when master oracle contract is updated
    event MasterOracleUpdated(IMasterOracle indexed oldOracle, IMasterOracle indexed newOracle);

    /// @notice Emitted when native token gateway is updated
    event NativeTokenGatewayUpdated(address indexed oldGateway, address indexed newGateway);

    /// @notice Emitted when a pool is registered
    event PoolRegistered(uint256 indexed id, address indexed pool);

    /// @notice Emitted when a pool is unregistered
    event PoolUnregistered(uint256 indexed id, address indexed pool);

    /// @notice Emitted when Swapper contract is updated
    event SwapperUpdated(ISwapper oldSwapFee, ISwapper newSwapFee);

    /// @notice Emitted when a guardian is added
    event GuardianAdded(address indexed guardian);

    /// @notice Emitted when a guardian is removed
    event GuardianRemoved(address indexed guardian);

    /// @notice Emitted when Operator contract is updated
    event OperatorUpdated(IOperator oldOperator, IOperator newOperator);

    /// @notice Emitted when Lz base gas limit updated
    event LzBaseGasLimitUpdated(uint256 oldLzBaseGasLimit, uint256 newLzBaseGasLimit);

    /// @notice Emitted when flag for pause bridge transfer is toggled
    event BridgingIsActiveUpdated(bool newIsActive);

    /// @notice Emitted when flag for support chain is toggled
    event DestinationChainIsActiveUpdated(uint16 chainId, bool newIsSupported);

    constructor() {
        _disableInitializers();
    }

    function initialize(IMasterOracle masterOracle_, address feeCollector_) external initializer {
        if (address(masterOracle_) == address(0)) revert OracleIsNull();
        if (feeCollector_ == address(0)) revert FeeCollectorIsNull();

        __Pauseable_init();

        masterOracle = masterOracle_;
        feeCollector = feeCollector_;

        nextPoolId = 1;
    }

    /**
     * @notice Check if any pool has the token as part of its offerings
     * @param syntheticToken_ Asset to check
     * @return _exists Return true if exists
     */
    function doesSyntheticTokenExist(ISyntheticToken syntheticToken_) external view returns (bool _exists) {
        uint256 _length = pools.length();
        for (uint256 i; i < _length; ++i) {
            if (IPool(pools.at(i)).doesSyntheticTokenExist(syntheticToken_)) {
                return true;
            }
        }
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
     * @inheritdoc Pauseable
     */
    function isGuardian(address sender_) public view override(IPoolRegistry, Pauseable) returns (bool) {
        return guardians.contains(sender_);
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
     * @notice Add guardian
     */
    function addGuardian(address guardian_) external onlyGovernor {
        if (guardian_ == address(0)) revert AddressIsNull();
        if (!guardians.add(guardian_)) revert AlreadyRegistered();
        emit GuardianAdded(guardian_);
    }

    /**
     * @notice Remove guardian
     */
    function removeGuardian(address guardian_) external onlyGovernor {
        if (!guardians.remove(guardian_)) revert UnregisteredGuardian();
        emit GuardianRemoved(guardian_);
    }

    /**
     * @notice Get all guardians
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getGuardians() external view returns (address[] memory) {
        return guardians.values();
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
     * @notice Update Operator contract
     */
    function updateOperator(IOperator newOperator_) external onlyGovernor {
        IOperator _currentOperator = operator;
        if (newOperator_ == _currentOperator) revert NewValueIsSameAsCurrent();

        emit OperatorUpdated(_currentOperator, newOperator_);
        operator = newOperator_;
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
     * @notice Pause/Unpause bridge transfers
     */
    function toggleBridgingIsActive() external onlyGovernor {
        bool _newIsBridgingActive = !isBridgingActive;
        emit BridgingIsActiveUpdated(_newIsBridgingActive);
        isBridgingActive = _newIsBridgingActive;
    }

    /**
     * @notice Allow/Disallow destination chain
     * @dev Use LZ chain id
     */
    function toggleDestinationChainIsActive(uint16 chainId_) external onlyGovernor {
        bool _isDestinationChainSupported = !isDestinationChainSupported[chainId_];
        emit DestinationChainIsActiveUpdated(chainId_, _isDestinationChainSupported);
        isDestinationChainSupported[chainId_] = _isDestinationChainSupported;
    }
}
