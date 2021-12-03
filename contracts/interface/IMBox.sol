// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./oracle/IOracle.sol";
import "./ISyntheticAsset.sol";
import "./IDepositToken.sol";
import "./ITreasury.sol";

/**
 * @notice MBox interface
 */
interface IMBox {
    function deposit(IDepositToken _collateral, uint256 _amount) external;

    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount) external;

    function withdraw(IDepositToken _collateral, uint256 _amount) external;

    function repay(ISyntheticAsset _syntheticAsset, uint256 _amount) external;

    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay,
        IDepositToken _collateral
    ) external;

    function swap(
        ISyntheticAsset _syntheticAssetIn,
        ISyntheticAsset _syntheticAssetOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut);

    function refinance(ISyntheticAsset _syntheticAssetIn, uint256 _amountToRefinance) external;

    function updateTreasury(ITreasury _newTreasury) external;

    function updateOracle(IOracle _newOracle) external;

    function updateDepositFee(uint256 _newDepositFee) external;

    function updateMintFee(uint256 _newMintFee) external;

    function updateWithdrawFee(uint256 _newWithdrawFee) external;

    function updateRepayFee(uint256 _newRepayFee) external;

    function updateSwapFee(uint256 _newSwapFee) external;

    function updateRefinanceFee(uint256 _newRefinanceFee) external;

    function updateLiquidatorFee(uint256 _newLiquidatorFee) external;

    function updateLiquidateFee(uint256 _newLiquidateFee) external;

    function updateMaxLiquidable(uint256 _newMaxLiquidable) external;
}
