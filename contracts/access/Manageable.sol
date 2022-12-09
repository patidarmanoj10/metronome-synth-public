// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/proxy/utils/Initializable.sol";
import "../utils/TokenHolder.sol";
import "../interfaces/IGovernable.sol";
import "../interfaces/IManageable.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is IManageable, TokenHolder, Initializable {
    /**
     * @notice Pool contract
     */
    IPool public pool;

    /**
     * @dev Throws if `msg.sender` isn't the pool
     */
    modifier onlyPool() {
        require(msg.sender == address(pool), "not-pool");
        _;
    }

    /**
     * @dev Throws if `msg.sender` isn't the governor
     */
    modifier onlyGovernor() {
        require(msg.sender == governor(), "not-governor");
        _;
    }

    /**
     * @dev Throws if contract is paused
     */
    modifier whenNotPaused() {
        require(!pool.paused(), "paused");
        _;
    }

    /**
     * @dev Throws if contract is shutdown
     */
    modifier whenNotShutdown() {
        require(!pool.everythingStopped(), "shutdown");
        _;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init(IPool pool_) internal initializer {
        require(address(pool_) != address(0), "pool-address-is-zero");
        pool = pool_;
    }

    /**
     * @notice Get the governor
     * @return _governor The governor
     */
    function governor() public view returns (address _governor) {
        _governor = IGovernable(address(pool)).governor();
    }

    /// @inheritdoc TokenHolder
    function _requireCanSweep() internal view override onlyGovernor {}

    uint256[49] private __gap;
}
