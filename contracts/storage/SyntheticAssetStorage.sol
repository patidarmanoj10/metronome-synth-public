// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/ISyntheticAsset.sol";
import "../interface/IDebtToken.sol";

abstract contract SyntheticAssetStorageV1 is ISyntheticAsset {
    mapping(address => uint256) public balanceOf;

    mapping(address => mapping(address => uint256)) public allowance;

    string public name;
    string public symbol;

    uint256 public totalSupply;
    uint256 public maxTotalSupplyInUsd;

    uint8 public decimals;

    /**
     * @notice Non-transferable token that represents users' debts
     */
    IDebtToken public debtToken;

    /**
     * @notice If a vsAsset isn't active, it disables minting new tokens
     */
    bool public isActive;

    /**
     * @notice Interest rate
     * @dev Use 0.1e18 for 10% APR
     */
    uint256 public interestRate;
}
