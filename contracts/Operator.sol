// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {TransientSlot} from "./dependencies/openzeppelin/utils/TransientSlot.sol";
import {Address} from "./dependencies/openzeppelin/utils/Address.sol";
import {ReentrancyGuardTransient} from "./utils/ReentrancyGuardTransient.sol";
import {IOperator} from "./interfaces/IOperator.sol";

/// @title Operator contract
/// @dev Allows Synth's users to perform calls from their EOAs
contract Operator is IOperator, ReentrancyGuardTransient {
    using TransientSlot for *;
    using Address for address;

    // keccak256(abi.encode(uint256(keccak256("io.metronome.storage.Operator")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant MSG_SENDER_STORAGE = 0x7981994d60f65f1a18561bb9cc3329c34123a74c00a075d350036a66d0ed9a00;

    /// @notice The sender which the operator is executing on behalf of
    modifier setMsgSender() {
        MSG_SENDER_STORAGE.asAddress().tstore(msg.sender);
        _;
        MSG_SENDER_STORAGE.asAddress().tstore(address(0));
    }

    /// @notice Get actual `msg.sender` that is executing the call
    /// @dev It reverts if read outside of a call context
    function getActualMsgSender() external view returns (address _actualMsgSender) {
        _actualMsgSender = MSG_SENDER_STORAGE.asAddress().tload();
        require(_actualMsgSender != address(0), "not-authenticated");
    }

    /// @notice Execute calls on sender's behalf
    function execute(
        Call[] calldata calls_
    ) external payable override nonReentrant setMsgSender returns (bytes[] memory _returnData) {
        uint256 _length = calls_.length;
        _returnData = new bytes[](_length);

        uint256 _sumOfValues;
        Call calldata _call;
        for (uint256 i; i < _length; ) {
            _call = calls_[i];
            uint256 _value = _call.value;
            unchecked {
                _sumOfValues += _value;
            }
            _returnData[i] = _call.target.functionCallWithValue(_call.callData, _value);
            unchecked {
                ++i;
            }
        }

        require(msg.value == _sumOfValues, "value-mismatch");
    }
}
