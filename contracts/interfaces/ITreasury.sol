// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface ITreasury {
    function pull(address to_, uint256 amount_) external;

    function migrateTo(address newTreasury_) external;
}
