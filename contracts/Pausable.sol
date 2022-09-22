// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/utils/Context.sol";
import "./interfaces/IPausable.sol";
import "./access/Governable.sol";

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 */
abstract contract Pausable is IPausable, Governable {
    event Paused(address account);
    event Shutdown(address account);
    event Unpaused(address account);
    event Open(address account);

    bool private _paused;
    bool private _everythingStopped;

    modifier whenNotPaused() {
        require(!paused(), "paused");
        _;
    }
    modifier whenPaused() {
        require(paused(), "not-paused");
        _;
    }

    modifier whenNotShutdown() {
        require(!everythingStopped(), "shutdown");
        _;
    }

    modifier whenShutdown() {
        require(everythingStopped(), "not-shutdown");
        _;
    }

    function everythingStopped() public view virtual returns (bool) {
        return _everythingStopped;
    }

    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /// @dev Pause contract operations, if contract is not paused.
    function pause() external virtual whenNotPaused onlyGovernor {
        _paused = true;
        emit Paused(_msgSender());
    }

    /// @dev Unpause contract operations, allow only if contract is paused and not shutdown.
    function unpause() external virtual whenPaused whenNotShutdown onlyGovernor {
        _paused = false;
        emit Unpaused(_msgSender());
    }

    /// @dev Shutdown contract operations, if not already shutdown.
    function shutdown() external virtual whenNotShutdown onlyGovernor {
        _everythingStopped = true;
        _paused = true;
        emit Shutdown(_msgSender());
    }

    /// @dev Open contract operations, if contract is in shutdown state
    function open() external virtual whenShutdown onlyGovernor {
        _everythingStopped = false;
        emit Open(_msgSender());
    }
}
