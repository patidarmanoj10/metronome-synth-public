// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract TreasuryUpgrader is UpgraderBase {
    constructor(address _owner) UpgraderBase(address(0)) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](1);
        calls[0] = abi.encodeWithSignature("met()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkAddress256Results(_beforeResults, _afterResults, 0, 0);
    }
}
