// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IDebtToken.sol";

abstract contract DebtTokenStorageV1 is IDebtToken {
    mapping(address => uint256) internal principalOf;
    mapping(address => uint256) internal interestRateOf;

    uint256 public totalSupply;
    uint8 public decimals;
    string public name;
    string public symbol;

    ISyntheticAsset public syntheticAsset;

    /**
     * @notice The block when interest accrual was calculated for the last time
     */
    uint256 public lastBlockAccrued;

    /**
     * @notice Accumulator of the total earned interest rate since the beginning
     */
    uint256 public debtIndex;
}
