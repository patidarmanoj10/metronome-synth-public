// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IERC20} from "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {MappedEnumerableSet} from "../lib/MappedEnumerableSet.sol";
import {ISwapper} from "../interfaces/external/ISwapper.sol";
import {IPool} from "../interfaces/IPool.sol";
import {ISmartFarmingManager} from "../interfaces/ISmartFarmingManager.sol";
import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";
import {ITreasury} from "../interfaces/ITreasury.sol";
import {IDepositToken} from "../interfaces/IDepositToken.sol";
import {IRewardsDistributor} from "../interfaces/IRewardsDistributor.sol";
import {ISyntheticToken} from "../interfaces/ISyntheticToken.sol";
import {IDebtToken} from "../interfaces/IDebtToken.sol";
import {IFeeProvider} from "../interfaces/IFeeProvider.sol";

// solhint-disable var-name-mixedcase, max-states-count
abstract contract PoolStorageV1 is IPool {
    /**
     * @notice The debt floor (in USD) for each synthetic token
     * This parameters is used to keep incentive for liquidators (i.e. cover gas and provide enough profit)
     */
    uint256 public override debtFloorInUsd;

    uint256 private depositFee__DEPRECATED;

    uint256 private issueFee__DEPRECATED;

    uint256 private withdrawFee__DEPRECATED;

    uint256 private repayFee__DEPRECATED;

    uint256 private swapFee__DEPRECATED;

    uint256 private liquidationFees__DEPRECATED;

    /**
     * @notice The max percent of the debt allowed to liquidate
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public override maxLiquidable;

    /**
     * @notice PoolRegistry
     */
    IPoolRegistry internal _poolRegistry;

    /**
     * @notice Swap feature on/off flag
     */
    bool public override isSwapActive;

    /**
     * @notice Treasury contract
     */
    ITreasury public override treasury;

    /**
     * @notice Represents collateral's deposits
     */
    EnumerableSet.AddressSet internal depositTokens;

    /**
     * @notice Get the deposit token's address from given underlying asset
     */
    mapping(IERC20 => IDepositToken) public override depositTokenOf;

    /**
     * @notice Available debt tokens
     */
    EnumerableSet.AddressSet internal debtTokens;

    /**
     * @notice Per-account deposit tokens (i.e. tokens that user has balance > 0)
     */
    MappedEnumerableSet.AddressSet internal depositTokensOfAccount;

    /**
     * @notice Per-account debt tokens (i.e. tokens that user has balance > 0)
     */
    MappedEnumerableSet.AddressSet internal debtTokensOfAccount;

    /**
     * @notice RewardsDistributor contracts
     */
    IRewardsDistributor[] internal rewardsDistributors__DEPRECATED;

    /**
     * @notice Get the debt token's address from given synthetic asset
     */
    mapping(ISyntheticToken => IDebtToken) public override debtTokenOf;
}

abstract contract PoolStorageV2 is PoolStorageV1 {
    ISwapper private swapper__DEPRECATED;

    /**
     * @notice FeeProvider contract
     */
    IFeeProvider public override feeProvider;

    /**
     * @notice RewardsDistributor contracts
     */
    EnumerableSet.AddressSet internal rewardsDistributors;
}

abstract contract PoolStorageV3 is PoolStorageV2 {
    /**
     * @notice SmartFarmingManager contract
     */
    ISmartFarmingManager public smartFarmingManager;
}

abstract contract PoolStorageV4 is PoolStorageV3 {
    /**
     * @notice Flag that pause/unpause pool's cross-chain activities
     */
    bool private isBridgingActive_DEPRECATED;
}
