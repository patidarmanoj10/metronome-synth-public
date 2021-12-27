// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./oracle/IOracle.sol";
import "./ISyntheticAsset.sol";
import "./IDepositToken.sol";
import "./ITreasury.sol";

/**
 * @notice IIssuer interface
 */
interface IIssuer {
    function isSyntheticAssetExists(ISyntheticAsset _syntheticAsset) external view returns (bool);

    function isDepositTokenExists(IDepositToken _depositToken) external view returns (bool);

    function getDepositTokens() external view returns (IDepositToken[] memory);

    function met() external view returns (IERC20);

    function syntheticAssetsMintedBy(address _account)
        external
        view
        returns (ISyntheticAsset[] memory _syntheticAssets);

    function debtOfUsingLatestPrices(address _account)
        external
        view
        returns (
            uint256 _debtInUsd,
            uint256 _lockedDepositInUsd,
            bool _anyPriceInvalid
        );

    function depositOfUsingLatestPrices(address _account)
        external
        view
        returns (uint256 _depositInUsd, bool _anyPriceInvalid);

    function debtPositionOfUsingLatestPrices(address _account)
        external
        view
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _unlockedDepositInUsd,
            bool _anyPriceInvalid
        );

    function debtPositionOf(address _account)
        external
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _unlockedDepositInUsd
        );

    function maxIssuableForUsingLatestPrices(address _account, ISyntheticAsset _syntheticAsset)
        external
        view
        returns (uint256 _maxIssuable, bool _anyPriceInvalid);

    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset) external returns (uint256 _maxIssuable);

    function addSyntheticAsset(ISyntheticAsset _synthetic) external;

    function removeSyntheticAsset(ISyntheticAsset _synthetic) external;

    function addDepositToken(IDepositToken _depositToken) external;

    function removeDepositToken(IDepositToken _depositToken) external;

    function updateOracle(IOracle _newOracle) external;

    function vsEth() external view returns (ISyntheticAsset);

    function mintSyntheticAssetAndDebtToken(
        ISyntheticAsset _syntheticAsset,
        address _to,
        uint256 _amount
    ) external;

    function burnSyntheticAssetAndDebtToken(
        ISyntheticAsset _syntheticAsset,
        address _syntheticAssetFrom,
        address _debtTokenFrom,
        uint256 _amount
    ) external;

    function mintDepositToken(
        IDepositToken _depositToken,
        address _to,
        uint256 _amount
    ) external;

    function collectFee(
        address _account,
        uint256 _fee,
        bool _onlyFromUnlocked
    ) external;

    function burnWithdrawnDeposit(
        IDepositToken _depositToken,
        address _account,
        uint256 _amount
    ) external;

    function seizeDepositToken(
        IDepositToken _depositToken,
        address _from,
        address _to,
        uint256 _amount
    ) external;

    function updateTreasury(ITreasury _newTreasury) external;

    function getTreasury() external view returns (ITreasury);

    function withdrawFromTreasury(
        IDepositToken _token,
        address _to,
        uint256 _amount
    ) external;

    function accrueInterest(ISyntheticAsset _syntheticAsset) external;
}
