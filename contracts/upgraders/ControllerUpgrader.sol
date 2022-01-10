// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract ControllerUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](10);
        calls[0] = abi.encodeWithSignature("depositFee()");
        calls[1] = abi.encodeWithSignature("mintFee()");
        calls[2] = abi.encodeWithSignature("withdrawFee()");
        calls[3] = abi.encodeWithSignature("repayFee()");
        calls[4] = abi.encodeWithSignature("swapFee()");
        calls[5] = abi.encodeWithSignature("liquidatorFee()");
        calls[6] = abi.encodeWithSignature("liquidateFee()");
        calls[7] = abi.encodeWithSignature("maxLiquidable()");
        calls[8] = abi.encodeWithSignature("oracle()");
        calls[9] = abi.encodeWithSignature("treasury()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkUint256Results(_beforeResults, _afterResults, 0, 7);
        _checkAddressResults(_beforeResults, _afterResults, 8, 9);
    }
}
