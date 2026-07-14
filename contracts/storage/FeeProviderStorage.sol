// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IFeeProvider} from "../interfaces/IFeeProvider.sol";
import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";
import {IESMET} from "../interfaces/external/IESMET.sol";

abstract contract FeeProviderStorageV1 is IFeeProvider {
    struct Tier {
        uint128 min; // esMET min balance needed to be eligible for `discount`
        uint128 discount; // discount in percentage to apply. Use 18 decimals (e.g. 1e16 = 1%)
    }

    /**
     * @notice The fee discount tiers
     */
    Tier[] private tiers__DEPRECATED;

    /**
     * @notice The default fee charged when swapping synthetic tokens
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 private defaultSwapFee__DEPRECATED;

    /**
     * @notice The fee charged when depositing collateral
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public override depositFee;

    /**
     * @notice The fee charged when minting a synthetic token
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public override issueFee;

    /**
     * @notice The fee charged when withdrawing collateral
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public override withdrawFee;

    /**
     * @notice The fee charged when repaying debt
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public override repayFee;

    /**
     * @notice The fees charged when liquidating a position
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    LiquidationFees public override liquidationFees;

    /**
     * @dev The Pool Registry
     */
    IPoolRegistry internal _poolRegistry;

    /**
     * @notice The esMET contract
     */
    IESMET public esMET;
}

abstract contract FeeProviderStorageV2 is FeeProviderStorageV1 {
    /**
     * @notice The fees charged when swapping synthetic tokens (by synthIn => synthOut directions)
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    mapping(address => mapping(address => uint256)) public override swapFees;
}
