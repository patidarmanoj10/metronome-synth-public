// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract IssuerUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function _calls() internal pure override returns (bytes[] memory calls) {
        calls = new bytes[](3);
        calls[0] = abi.encodeWithSignature("vsEth()");
        calls[1] = abi.encodeWithSignature("met()");
        calls[2] = abi.encodeWithSignature("oracle()");
    }

    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal pure override {
        _checkAddressResults(_beforeResults, _afterResults, 0, 2);
    }
}
