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
    modifier onlyIfSyntheticTokenExists(ISyntheticToken _syntheticToken) {
        require(isSyntheticTokenExists(_syntheticToken), "synthetic-inexistent");
        _;
    }

    /**
     * @dev Throws if synthetic token isn't enabled
     */
    modifier onlyIfSyntheticTokenIsActive(ISyntheticToken _syntheticToken) {
        require(_syntheticToken.isActive(), "synthetic-inactive");
        _;
    }

    function initialize(IMasterOracle _masterOracle) public initializer {
        require(address(_masterOracle) != address(0), "oracle-is-null");

        __Governable_init();

        masterOracle = _masterOracle;

        swapFee = 6e15; // 0.6%
    }

    /**
     * @notice Check if token is part of the synthetic offerings
     * @param _syntheticToken Asset to check
     * @return true if exist
     */
    function isSyntheticTokenExists(ISyntheticToken _syntheticToken) public view override returns (bool) {
        uint256 _length = pools.length();
        for (uint256 i; i < _length; ++i) {
            if (IPool(pools.at(i)).isSyntheticTokenExists(_syntheticToken)) {
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
     * @param _syntheticTokenIn Synthetic token to sell
     * @param _syntheticTokenOut Synthetic token to buy
     * @param _amountIn Amount to swap
     */
    function swap(
        ISyntheticToken _syntheticTokenIn,
        ISyntheticToken _syntheticTokenOut,
        uint256 _amountIn
    )
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfSyntheticTokenExists(_syntheticTokenIn)
        onlyIfSyntheticTokenExists(_syntheticTokenOut)
        onlyIfSyntheticTokenIsActive(_syntheticTokenOut)
        returns (uint256 _amountOut)
    {
        address _account = _msgSender();

        require(_amountIn > 0, "amount-in-is-0");
        require(_amountIn <= _syntheticTokenIn.balanceOf(_account), "amount-in-gt-balance");
        _syntheticTokenIn.burn(_account, _amountIn);

        _amountOut = masterOracle.quote(address(_syntheticTokenIn), address(_syntheticTokenOut), _amountIn);

        uint256 _feeAmount;
        if (swapFee > 0) {
            _feeAmount = _amountOut.wadMul(swapFee);
            // FIXME: See more: https://github.com/bloqpriv/metronome-synth/issues/497
            // _syntheticTokenOut.mint(address(treasury), _feeAmount);
            _syntheticTokenOut.mint(address(this), _feeAmount);
            _amountOut -= _feeAmount;
        }

        _syntheticTokenOut.mint(_account, _amountOut);

        emit SyntheticTokenSwapped(_account, _syntheticTokenIn, _syntheticTokenOut, _amountIn, _amountOut, _feeAmount);
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(uint256 _newSwapFee) external override onlyGovernor {
        require(_newSwapFee <= 1e18, "max-is-100%");
        uint256 _currentSwapFee = swapFee;
        require(_newSwapFee != _currentSwapFee, "new-same-as-current");
        emit SwapFeeUpdated(_currentSwapFee, _newSwapFee);
        swapFee = _newSwapFee;
    }

    /**
     * @notice Update master oracle contract
     */
    function updateMasterOracle(IMasterOracle _newMasterOracle) external override onlyGovernor {
        require(address(_newMasterOracle) != address(0), "address-is-null");
        IMasterOracle _currentMasterOracle = masterOracle;
        require(_newMasterOracle != _currentMasterOracle, "new-same-as-current");

        emit MasterOracleUpdated(_currentMasterOracle, _newMasterOracle);
        masterOracle = _newMasterOracle;
    }
}
