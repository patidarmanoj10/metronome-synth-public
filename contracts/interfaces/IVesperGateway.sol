// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IPool} from "./IPool.sol";
import {IVPool} from "./external/IVPool.sol";

interface IVesperGateway {
    function deposit(IPool pool_, IVPool vToken_, uint256 amount_) external;

    function withdraw(IPool pool_, IVPool vToken_, uint256 amount_) external;
}
