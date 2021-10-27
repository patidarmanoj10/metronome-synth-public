// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./oracle/IOracle.sol";
import "./ISyntheticAsset.sol";
import "./IDepositToken.sol";

/**
 * @notice IIssuer interface
 */
interface IIssuer {
    function isSyntheticAssetExists(ISyntheticAsset _syntheticAsset) external view returns (bool);

    function depositToken() external view returns (IDepositToken);

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

    function addSyntheticAsset(ISyntheticAsset _synthetic) external;

    function removeSyntheticAsset(ISyntheticAsset _synthetic) external;

    function updateDepositToken(IDepositToken _newDepositToken) external;

    function updateOracle(IOracle _newOracle) external;

    function mEth() external view returns (ISyntheticAsset);

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

    function mintDepositToken(address _to, uint256 _amount) external;

    function collectFee(
        address _account,
        uint256 _fee,
        bool _onlyFromUnlocked
    ) external;

    function burnWithdrawnDeposit(address _account, uint256 _amount) external;

    function seizeDepositToken(
        address _from,
        address _to,
        uint256 _amount
    ) external;
}
