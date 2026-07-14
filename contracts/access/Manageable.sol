// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Initializable} from "../dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import {SynthContext} from "../utils/SynthContext.sol";
import {IGovernable} from "../interfaces/IGovernable.sol";
import {IManageable} from "../interfaces/IManageable.sol";
import {IPool} from "../interfaces/IPool.sol";
import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";

error SenderIsNotPool();
error SenderIsNotGovernor();
error IsPaused();
error IsShutdown();
error PoolAddressIsNull();

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is IManageable, SynthContext, Initializable {
    /**
     * @notice Pool contract
     */
    IPool public pool;

    /**
     * @dev Throws if `_msgSender()` isn't the pool
     */
    modifier onlyPool() {
        if (_msgSender() != address(pool)) revert SenderIsNotPool();
        _;
    }

    /**
     * @dev Throws if `_msgSender()` isn't the governor
     */
    modifier onlyGovernor() {
        if (_msgSender() != governor()) revert SenderIsNotGovernor();
        _;
    }

    /**
     * @dev Throws if contract is paused
     */
    modifier whenNotPaused() {
        if (pool.paused()) revert IsPaused();
        _;
    }

    /**
     * @dev Throws if contract is shutdown
     */
    modifier whenNotShutdown() {
        if (pool.everythingStopped()) revert IsShutdown();
        _;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init(IPool pool_) internal onlyInitializing {
        if (address(pool_) == address(0)) revert PoolAddressIsNull();
        pool = pool_;
    }

    /**
     * @notice Get the governor
     * @return _governor The governor
     */
    function governor() public view returns (address _governor) {
        _governor = IGovernable(address(pool)).governor();
    }

    /// @inheritdoc SynthContext
    function poolRegistry() public view override returns (IPoolRegistry) {
        return pool.poolRegistry();
    }

    uint256[49] private __gap;
}
