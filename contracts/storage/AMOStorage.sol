// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {EnumerableSet} from "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";

contract AMOStorage {
    /**
     * @notice The Pool Registry
     */
    IPoolRegistry internal _poolRegistry;

    /**
     * @dev Direct deposit keepers
     */
    EnumerableSet.AddressSet internal keepers;

    /**
     * @dev Authorized Vesper Pools
     */
    mapping(address => address) public vPools;
}
