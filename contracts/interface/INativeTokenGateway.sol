// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IController.sol";

interface INativeTokenGateway {
    function deposit(IController _controller) external payable;

    function withdraw(IController _controller, uint256 _amount) external;
}
