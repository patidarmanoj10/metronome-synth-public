// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/ISyntheticAsset.sol";
import "../interface/IDebtToken.sol";
import "../interface/oracle/IOracle.sol";

abstract contract SyntheticAssetStorageV1 is ISyntheticAsset {
    mapping(address => uint256) public balanceOf;

    mapping(address => mapping(address => uint256)) public allowance;

    string public name;
    string public symbol;

    uint256 public totalSupply;
    uint256 public maxTotalSupplyInUsd;

    uint8 public decimals;

    /**
     * @notice Collaterization ration for the synthetic asset
     * @dev Use 18 decimals (e.g. 15e17 = 150%)
     */
    uint256 public collateralizationRatio;

    /**
     * @notice Non-transferable token that represents users' debts
     */
    IDebtToken public debtToken;

    /**
     * @notice If a vsAsset isn't active, it disables minting new tokens
     */
    bool public isActive;

    /**
     * @notice Prices oracle
     */
    IOracle public oracle;

    /**
     * @notice Interest rate
     * @dev Use 0.1e18 for 10% APR
     */
    uint256 public interestRate;
}
