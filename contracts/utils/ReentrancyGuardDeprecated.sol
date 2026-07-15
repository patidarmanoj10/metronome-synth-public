// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @dev This contract is used to avoid breaking storage when migrating to `ReentrancyGuardTransient`
abstract contract ReentrancyGuardDeprecated {
    uint256 private _status_DEPRECATED;
}
