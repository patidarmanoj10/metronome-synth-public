// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract DebtTokenUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](7);
        calls[0] = abi.encodeWithSignature("totalSupply()");
        calls[1] = abi.encodeWithSignature("lastTimestampAccrued()");
        calls[2] = abi.encodeWithSignature("debtIndex()");
        calls[3] = abi.encodeWithSignature("decimals()");
        calls[4] = abi.encodeWithSignature("name()");
        calls[5] = abi.encodeWithSignature("symbol()");
        calls[6] = abi.encodeWithSignature("syntheticToken()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkUint256Results(_beforeResults, _afterResults, 0, 2);
        _checkUint8Results(_beforeResults, _afterResults, 3, 3);
        _checkStringResults(_beforeResults, _afterResults, 4, 5);
        _checkAddressResults(_beforeResults, _afterResults, 6, 6);
    }
}
