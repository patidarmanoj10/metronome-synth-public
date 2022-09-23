// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/IDepositToken.sol";

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
     * @notice Collateralization ration for the deposit token
     * @dev Use 18 decimals (e.g. 0.66e18 = 66%)
     */
    uint256 public collateralizationRatio;

    /**
     * @notice If a collateral isn't active, it disables minting new tokens
     */
    bool public isActive;
}
