// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IPool} from "./IPool.sol";

interface INativeTokenGateway {
    function deposit(IPool pool_) external payable;

    function withdraw(IPool pool_, uint256 amount_) external;
}
