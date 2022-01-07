// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/utils/Context.sol";
import "./access/Governable.sol";

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 */
abstract contract Pausable is Governable {
    event Paused(address account);
    event Shutdown(address account);
    event Unpaused(address account);
    event Open(address account);

    bool public paused;
    bool public stopEverything;

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }
    modifier whenPaused() {
        require(paused, "not-paused");
        _;
    }

    modifier whenNotShutdown() {
        require(!stopEverything, "shutdown");
        _;
    }

    modifier whenShutdown() {
        require(stopEverything, "not-shutdown");
        _;
    }

    /// @dev Pause contract operations, if contract is not paused.
    function pause() external virtual whenNotPaused onlyGovernor {
        paused = true;
        emit Paused(_msgSender());
    }

    /// @dev Unpause contract operations, allow only if contract is paused and not shutdown.
    function unpause() external virtual whenPaused whenNotShutdown onlyGovernor {
        paused = false;
        emit Unpaused(_msgSender());
    }

    /// @dev Shutdown contract operations, if not already shutdown.
    function shutdown() external virtual whenNotShutdown onlyGovernor {
        stopEverything = true;
        paused = true;
        emit Shutdown(_msgSender());
    }

    /// @dev Open contract operations, if contract is in shutdown state
    function open() external virtual whenShutdown onlyGovernor {
        stopEverything = false;
        emit Open(_msgSender());
    }
}
