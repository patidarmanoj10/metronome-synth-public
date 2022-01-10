// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./Governable.sol";
import "../interface/IController.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is Governable {
    /**
     * @notice Controller contract
     */
    IController public controller;

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init() internal initializer {
        __Governable_init();
    }

    /**
     * @notice Requires that the caller is the Controller contract
     */
    modifier onlyController() {
        require(_msgSender() == address(controller), "not-controller");
        _;
    }

    /**
     * @notice Update Controller contract
     * @param _controller The new Controller contract
     */
    function setController(IController _controller) public onlyGovernor {
        require(address(_controller) != address(0), "new-vsynth-address-is-zero");
        controller = _controller;
    }

    uint256[49] private __gap;
}
