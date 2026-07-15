// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface IPauseable {
    function paused() external view returns (bool);

    function everythingStopped() external view returns (bool);
}
