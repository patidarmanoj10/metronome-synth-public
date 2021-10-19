// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract SyntheticAssetUpgrader is UpgraderBase {
    constructor(address _owner) UpgraderBase(address(0)) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](6);
        calls[0] = abi.encodeWithSignature("name()");
        calls[1] = abi.encodeWithSignature("symbol()");
        calls[2] = abi.encodeWithSignature("totalSupply()");
        calls[3] = abi.encodeWithSignature("collateralizationRatio()");
        calls[4] = abi.encodeWithSignature("underlying()");
        calls[5] = abi.encodeWithSignature("debtToken()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkStringResults(_beforeResults, _afterResults, 0, 1);
        _checkUint256Results(_beforeResults, _afterResults, 2, 3);
        _checkAddress256Results(_beforeResults, _afterResults, 4, 5);
    }
}
