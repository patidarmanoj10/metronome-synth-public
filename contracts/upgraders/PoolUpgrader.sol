// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./UpgraderBase.sol";

contract PoolUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    /// @inheritdoc UpgraderBase
    function _calls() internal pure override returns (bytes[] memory _callsList) {
        _callsList = new bytes[](7);
        _callsList[0] = abi.encodeWithSignature("debtFloorInUsd()");
        _callsList[1] = abi.encodeWithSignature("maxLiquidable()");
        _callsList[2] = abi.encodeWithSignature("treasury()");
        _callsList[3] = abi.encodeWithSignature("poolRegistry()");
        _callsList[4] = abi.encodeWithSignature("isSwapActive()");
        _callsList[5] = abi.encodeWithSignature("governor()");
        _callsList[6] = abi.encodeWithSignature("swapper()");
    }
}
