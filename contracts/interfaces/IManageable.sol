// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IPool} from "./IPool.sol";

/**
 * @notice Manageable interface
 */
interface IManageable {
    function pool() external view returns (IPool _pool);
}
