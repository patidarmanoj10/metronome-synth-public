// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract DebtTokenUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](4);
        calls[0] = abi.encodeWithSignature("totalSupply()");
        calls[1] = abi.encodeWithSignature("decimals()");
        calls[2] = abi.encodeWithSignature("name()");
        calls[3] = abi.encodeWithSignature("symbol()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkUint256Results(_beforeResults, _afterResults, 0, 0);
        _checkUint8Results(_beforeResults, _afterResults, 1, 1);
        _checkStringResults(_beforeResults, _afterResults, 2, 3);
    }
}
