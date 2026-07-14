// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Pauseable} from "../utils/Pauseable.sol";

contract PauseableMock is Pauseable {
    mapping(address => bool) internal _isGuardian;

    function setGuardian(address address_, bool isGuardian_) external {
        _isGuardian[address_] = isGuardian_;
    }

    function isGuardian(address sender_) public view override returns (bool) {
        return _isGuardian[sender_];
    }
}
