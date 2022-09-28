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

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init() internal initializer {}

    /**
     * @notice Requires that the caller is the Pool contract
     */
    modifier onlyPool() {
        require(msg.sender == address(pool), "not-pool");
        _;
    }

    /**
     * @notice Requires that the caller is the Pool contract
     */
    modifier onlyGovernor() {
        require(msg.sender == governor(), "not-governor");
        _;
    }

    modifier whenNotPaused() {
        require(!pool.paused(), "paused");
        _;
    }

    modifier whenNotShutdown() {
        require(!pool.everythingStopped(), "shutdown");
        _;
    }

    function governor() public view returns (address _governor) {
        _governor = IGovernable(address(pool)).governor();
    }

    function _requireCanSweep() internal view override onlyGovernor {}

    /**
     * @notice Update Pool contract
     * @param pool_ The new Pool contract
     */
    function setPool(IPool pool_) external onlyGovernor {
        require(address(pool_) != address(0), "new-pool-address-is-zero");
        pool = pool_;
    }

    uint256[49] private __gap;
}
