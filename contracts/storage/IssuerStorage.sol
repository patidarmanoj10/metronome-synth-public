// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IIssuer.sol";

abstract contract IssuerStorageV1 is IIssuer {
    /**
     * @notice Prices oracle
     */
    IOracle public oracle;

    /**
     * @notice Treasury contract
     */
    ITreasury public treasury;

    /**
     * @notice Represents collateral's deposits (e.g. vSynth-MET token)
     */
    IDepositToken[] public depositTokens;
    mapping(address => IDepositToken) public depositTokenByAddress;

    /**
     * @notice Avaliable synthetic assets
     * @dev The syntheticAssets[0] is vsETH
     */
    ISyntheticAsset[] public syntheticAssets;
    mapping(address => ISyntheticAsset) public syntheticAssetByAddress;
}
