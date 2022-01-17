// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IDepositToken.sol";

abstract contract DepositTokenStorageV1 is IDepositToken {
    mapping(address => uint256) public balanceOf;

    mapping(address => mapping(address => uint256)) public allowance;

    string public name;
    string public symbol;
    uint8 public decimals;

    uint256 public totalSupply;
    uint256 public maxTotalSupplyInUsd;

    /**
     * @notice Deposit underlying asset (e.g. MET)
     */
    IERC20 public underlying;

    /**
     * @notice The min amount of time that an account should wait after deposit collateral before be able to withdraw
     */
    uint256 public minDepositTime;

    /**
     * @notice Stores de timestamp of last deposit event of each account. It's used combined with `minDepositTime`.
     */
    mapping(address => uint256) public lastDepositOf;

    /**
     * @notice If a collateral isn't active, it disables minting new tokens
     */
    bool public isActive;
}
