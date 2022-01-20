// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./oracle/IMasterOracle.sol";
import "./ISyntheticAsset.sol";
import "./IDepositToken.sol";
import "./ITreasury.sol";

/**
 * @notice Controller interface
 */
interface IController {
    function isSyntheticAssetExists(ISyntheticAsset _syntheticAsset) external view returns (bool);

    function isDepositTokenExists(IDepositToken _depositToken) external view returns (bool);

    function depositTokenOf(IERC20 _underlying) external view returns (IDepositToken);

    function getDepositTokens() external view returns (address[] memory);

    function getSyntheticAssets() external view returns (address[] memory);

    function debtOf(address _account) external view returns (uint256 _debtInUsd, uint256 _lockedDepositInUsd);

    function depositOf(address _account) external view returns (uint256 _depositInUsd);

    function debtPositionOf(address _account)
        external
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _unlockedDepositInUsd
        );

    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset) external returns (uint256 _maxIssuable);

    function addSyntheticAsset(address _synthetic) external;

    function removeSyntheticAsset(ISyntheticAsset _synthetic) external;

    function addDepositToken(address _depositToken) external;

    function removeDepositToken(IDepositToken _depositToken) external;

    function deposit(
        IDepositToken _depositToken,
        uint256 _amount,
        address _onBehalfOf
    ) external;

    function mint(
        ISyntheticAsset _syntheticAsset,
        uint256 _amount,
        address _to
    ) external;

    function withdraw(
        IDepositToken _depositToken,
        uint256 _amount,
        address _to
    ) external;

    function repay(
        ISyntheticAsset _syntheticAsset,
        address _onBehalfOf,
        uint256 _amount
    ) external;

    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay,
        IDepositToken _depositToken
    ) external;

    function swap(
        ISyntheticAsset _syntheticAssetIn,
        ISyntheticAsset _syntheticAssetOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut);

    function updateOracle(IMasterOracle _newOracle) external;

    function updateDebtFloor(uint256 _newDebtFloorInUsd) external;

    function updateDepositFee(uint256 _newDepositFee) external;

    function updateMintFee(uint256 _newMintFee) external;

    function updateWithdrawFee(uint256 _newWithdrawFee) external;

    function updateRepayFee(uint256 _newRepayFee) external;

    function updateSwapFee(uint256 _newSwapFee) external;

    function updateLiquidatorFee(uint256 _newLiquidatorFee) external;

    function updateLiquidateFee(uint256 _newLiquidateFee) external;

    function updateMaxLiquidable(uint256 _newMaxLiquidable) external;

    function updateTreasury(ITreasury _newTreasury, bool _withMigration) external;

    function treasury() external view returns (ITreasury);

    function oracle() external view returns (IMasterOracle);

    function accrueInterest(ISyntheticAsset _syntheticAsset) external;

    function addToDepositTokensOfAccount(address _account) external;

    function removeFromDepositTokensOfAccount(address _account) external;

    function addToDebtTokensOfAccount(address _account) external;

    function removeFromDebtTokensOfAccount(address _account) external;

    function getDepositTokensOfAccount(address _account) external view returns (address[] memory);

    function getDebtTokensOfAccount(address _account) external view returns (address[] memory);
}
