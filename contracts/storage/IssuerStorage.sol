// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IIssuer.sol";
import "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";

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
    EnumerableSet.AddressSet internal depositTokens;

    /**
     * @notice Avaliable synthetic assets
     * @dev The syntheticAssets[0] is vsETH
     */
    EnumerableSet.AddressSet internal syntheticAssets;
}
