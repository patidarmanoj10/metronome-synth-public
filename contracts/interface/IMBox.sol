// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./oracle/IOracle.sol";
import "./ISyntheticAsset.sol";
import "./IDepositToken.sol";

/**
 * @notice MBox interface
 */
interface IMBox {
    function deposit(uint256 _amount) external;

    function debtOfUsingLatestPrices(address _account)
        external
        view
        returns (
            uint256 _debtInUsd,
            uint256 _lockedDepositInUsd,
            bool _anyPriceInvalid
        );

    function debtPositionOfUsingLatestPrices(address _account)
        external
        view
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit,
            bool _anyPriceInvalid
        );

    function debtPositionOf(address _account)
        external
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        );

    function maxIssuableForUsingLatestPrices(address _account, ISyntheticAsset _syntheticAsset)
        external
        view
        returns (uint256 _maxIssuable, bool _anyPriceInvalid);

    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset) external returns (uint256 _maxIssuable);

    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount) external;

    function withdraw(uint256 _amount) external;

    function repay(ISyntheticAsset _syntheticAsset, uint256 _amount) external;

    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay
    ) external;

    function swap(
        ISyntheticAsset _syntheticAssetIn,
        ISyntheticAsset _syntheticAssetOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut);

    function refinance(ISyntheticAsset _syntheticAssetIn, uint256 _amountToRefinance) external;

    function addSyntheticAsset(ISyntheticAsset _synthetic) external;

    function removeSyntheticAsset(ISyntheticAsset _synthetic) external;

    function updateTreasury(address _newTreasury) external;

    function setDepositToken(IDepositToken _newDepositToken) external;

    function setOracle(IOracle _newOracle) external;

    function setDepositFee(uint256 _newDepositFee) external;

    function setMintFee(uint256 _newMintFee) external;

    function setWithdrawFee(uint256 _newWithdrawFee) external;

    function setRepayFee(uint256 _newRepayFee) external;

    function setSwapFee(uint256 _newSwapFee) external;

    function setRefinanceFee(uint256 _newRefinanceFee) external;

    function setLiquidatorFee(uint256 _newLiquidatorFee) external;

    function setLiquidateFee(uint256 _newLiquidateFee) external;

    function setMaxLiquidable(uint256 _newMaxLiquidable) external;
}
