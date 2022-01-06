// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IController.sol";

interface IWETHGateway {
    function depositETH(IController _controller) external payable;

    function withdrawETH(IController _controller, uint256 _amount) external;
}
