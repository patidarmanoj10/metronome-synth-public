// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {UpgraderBase} from "./UpgraderBase.sol";

contract SmartFarmingManagerUpgrader is UpgraderBase {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    /// @inheritdoc UpgraderBase
    function _calls() internal pure virtual override returns (bytes[] memory _callsList) {
        _callsList = new bytes[](2);
        _callsList[0] = abi.encodeWithSignature("pool()");
        _callsList[1] = abi.encodeWithSignature("crossChainRequestsLength()");
    }
}

contract SmartFarmingManagerUpgraderV2 is SmartFarmingManagerUpgrader {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _owner) SmartFarmingManagerUpgrader(_owner) {}

    /// @inheritdoc UpgraderBase
    function _calls() internal pure virtual override returns (bytes[] memory _callsList) {
        _callsList = new bytes[](1);
        _callsList[0] = abi.encodeWithSignature("pool()");
    }
}
