// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IGovernable.sol";

interface IPoolRegistry is IGovernable {
    function poolExists(address pool_) external view returns (bool);

    function getPools() external view returns (address[] memory);

    function registerPool(address pool_) external;

    function unregisterPool(address pool_) external;
}
