// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IPool.sol";

interface INativeTokenGateway {
    function deposit(IPool _pool) external payable;

    function withdraw(IPool _pool, uint256 _amount) external;
}
