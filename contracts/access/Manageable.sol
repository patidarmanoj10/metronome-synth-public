// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/utils/Context.sol";
import "../dependencies/openzeppelin/proxy/utils/Initializable.sol";
import "../utils/TokenHolder.sol";
import "../interface/IGovernable.sol";
import "../interface/IController.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is Context, TokenHolder, Initializable {
    /**
     * @notice Controller contract
     */
    IController public controller;

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init() internal initializer {}

    /**
     * @notice Requires that the caller is the Controller contract
     */
    modifier onlyController() {
        require(_msgSender() == address(controller), "not-controller");
        _;
    }

    /**
     * @notice Requires that the caller is the Controller contract
     */
    modifier onlyGovernor() {
        require(_msgSender() == governor(), "not-governor");
        _;
    }

    modifier whenNotPaused() {
        require(!controller.paused(), "paused");
        _;
    }

    modifier whenNotShutdown() {
        require(!controller.everythingStopped(), "not-shutdown");
        _;
    }

    function governor() public view returns (address _governor) {
        _governor = IGovernable(address(controller)).governor();
    }

    function _requireCanSweep() internal view override onlyGovernor {}

    /**
     * @notice Update Controller contract
     * @param _controller The new Controller contract
     */
    function setController(IController _controller) external onlyGovernor {
        require(address(_controller) != address(0), "new-controller-address-is-zero");
        controller = _controller;
    }

    uint256[49] private __gap;
}
