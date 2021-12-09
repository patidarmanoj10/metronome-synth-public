// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract VSynthsUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](12);
        calls[0] = abi.encodeWithSignature("depositFee()");
        calls[1] = abi.encodeWithSignature("mintFee()");
        calls[2] = abi.encodeWithSignature("withdrawFee()");
        calls[3] = abi.encodeWithSignature("repayFee()");
        calls[4] = abi.encodeWithSignature("swapFee()");
        calls[5] = abi.encodeWithSignature("refinanceFee()");
        calls[6] = abi.encodeWithSignature("liquidatorFee()");
        calls[7] = abi.encodeWithSignature("liquidateFee()");
        calls[8] = abi.encodeWithSignature("maxLiquidable()");
        calls[9] = abi.encodeWithSignature("treasury()");
        calls[10] = abi.encodeWithSignature("oracle()");
        calls[11] = abi.encodeWithSignature("issuer()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkUint256Results(_beforeResults, _afterResults, 0, 8);
        _checkAddressResults(_beforeResults, _afterResults, 9, 11);
    }
}
