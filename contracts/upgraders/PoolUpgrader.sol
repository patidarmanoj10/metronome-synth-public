// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract PoolUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](9);
        calls[0] = abi.encodeWithSignature("debtFloorInUsd()");
        calls[1] = abi.encodeWithSignature("depositFee()");
        calls[2] = abi.encodeWithSignature("issueFee()");
        calls[3] = abi.encodeWithSignature("withdrawFee()");
        calls[4] = abi.encodeWithSignature("repayFee()");
        calls[5] = abi.encodeWithSignature("liquidationFees()");
        calls[6] = abi.encodeWithSignature("maxLiquidable()");
        calls[7] = abi.encodeWithSignature("treasury()");
        calls[8] = abi.encodeWithSignature("poolRegistry()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkUint256Results(_beforeResults, _afterResults, 0, 6);
        _checkAddressResults(_beforeResults, _afterResults, 7, 8);
    }
}
