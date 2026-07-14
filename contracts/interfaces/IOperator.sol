// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface IOperator {
    struct Call {
        address target;
        uint256 value;
        bytes callData;
    }

    function getActualMsgSender() external view returns (address);

    function execute(Call[] calldata calls_) external payable returns (bytes[] memory _returnData);
}
