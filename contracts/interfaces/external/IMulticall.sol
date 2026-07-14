// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IMulticall {
    struct Call {
        address target;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    struct Call3Value {
        address target;
        bool allowFailure;
        uint256 value;
        bytes callData;
    }

    function aggregate(Call[] calldata calls) external returns (uint256 blockNumber, bytes[] memory returnData);

    function aggregate3Value(Call3Value[] calldata calls) external payable returns (Result[] memory returnData);
}
