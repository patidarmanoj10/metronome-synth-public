// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name

pragma solidity 0.8.9;

import "../interface/IIssuer.sol";
import "../interface/IDepositToken.sol";

contract IssuerMock is IIssuer {
    IDepositToken public depositToken;
    IOracle public oracle;

    constructor(IDepositToken _depositToken, IOracle _oracle) {
        depositToken = _depositToken;
        oracle = _oracle;
    }

    function mockCall(address _to, bytes memory _data) public {
        (bool success, bytes memory data) = _to.call(_data);
        require(success, extractRevertReason(data));
    }

    function extractRevertReason(bytes memory revertData) internal pure returns (string memory reason) {
        uint256 l = revertData.length;
        if (l < 68) return "";
        uint256 t;
        assembly {
            revertData := add(revertData, 4)
            t := mload(revertData) // Save the content of the length slot
            mstore(revertData, sub(l, 4)) // Set proper length
        }
        reason = abi.decode(revertData, (string));
        assembly {
            mstore(revertData, t) // Restore the content of the length slot
        }
    }

    function getDepositTokens() external pure returns (IDepositToken[] memory) {
        revert("mock-does-not-implement");
    }

    function deposit(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function debtOfUsingLatestPrices(address)
        external
        pure
        returns (
            uint256,
            uint256,
            bool
        )
    {
        revert("mock-does-not-implement");
    }

    function debtPositionOfUsingLatestPrices(address)
        external
        pure
        returns (
            bool,
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        revert("mock-does-not-implement");
    }

    function depositOfUsingLatestPrices(address) external pure returns (uint256, bool) {
        revert("mock-does-not-implement");
    }

    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _unlockedDepositInUsd
        )
    {
        _isHealthy = true;
        _lockedDepositInUsd = 0;
        uint256 _deposit = depositToken.balanceOf(_account);
        (_depositInUsd, ) = oracle.convertToUsdUsingLatestPrice(depositToken.underlying(), _deposit);
        _unlockedDepositInUsd = _depositInUsd - _lockedDepositInUsd;
    }

    function syntheticAssetsMintedBy(address) external pure returns (ISyntheticAsset[] memory) {
        revert("mock-does-not-implement");
    }

    function addSyntheticAsset(ISyntheticAsset) external pure {
        revert("mock-does-not-implement");
    }

    function removeSyntheticAsset(ISyntheticAsset) external pure {
        revert("mock-does-not-implement");
    }

    function addDepositToken(IDepositToken) external pure {
        revert("mock-does-not-implement");
    }

    function removeDepositToken(IDepositToken) external pure {
        revert("mock-does-not-implement");
    }

    function maxIssuableFor(address, ISyntheticAsset) external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function maxIssuableForUsingLatestPrices(address, ISyntheticAsset) external pure returns (uint256, bool) {
        revert("mock-does-not-implement");
    }

    function updateOracle(IOracle) external pure {
        revert("mock-does-not-implement");
    }

    function vsEth() external pure returns (ISyntheticAsset) {
        revert("mock-does-not-implement");
    }

    function met() external pure returns (IERC20) {
        revert("mock-does-not-implement");
    }

    function mintSyntheticAsset(
        ISyntheticAsset,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function mintDebtToken(
        IDebtToken,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function burnSyntheticAsset(
        ISyntheticAsset,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function burnDebtToken(
        IDebtToken,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function mintDepositToken(
        IDepositToken,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function burnDepositToken(
        IDepositToken,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function seizeDepositToken(
        IDepositToken,
        address,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function seizeSyntheticAsset(
        ISyntheticAsset,
        address,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function isSyntheticAssetExists(ISyntheticAsset) external pure returns (bool) {
        revert("mock-does-not-implement");
    }

    function isDepositTokenExists(IDepositToken) external pure returns (bool) {
        revert("mock-does-not-implement");
    }

    function getTreasury() external pure returns (ITreasury) {
        revert("mock-does-not-implement");
    }

    function updateTreasury(ITreasury) external pure {
        revert("mock-does-not-implement");
    }

    function pullFromTreasury(
        IDepositToken,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function accrueInterest(ISyntheticAsset) external pure {
        revert("mock-does-not-implement");
    }
}
