// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name

pragma solidity 0.8.9;

import "../interface/IMBox.sol";
import "../interface/IDepositToken.sol";

contract MBoxMock is IMBox {
    IDepositToken public depositToken;
    uint256 public lockedCollateral;

    constructor(IDepositToken _depositToken) {
        depositToken = _depositToken;
    }

    function updateLockedCollateral(uint256 _lockedDeposit) external {
        lockedCollateral = _lockedDeposit;
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

    function deposit(uint256 _amount) external {
        revert("mock-does-not-implement");
    }

    function debtOfUsingLatestPrices(address _account)
        external
        view
        returns (
            uint256 _debtInUsd,
            uint256 _lockedDepositInUsd,
            bool _anyPriceInvalid
        )
    {
        revert("mock-does-not-implement");
    }

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
        )
    {
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
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        _isHealthy = true;
        _lockedDepositInUsd = 0;
        _depositInUsd = 0;
        _deposit = depositToken.balanceOf(_account);
        _lockedDeposit = lockedCollateral;
        _unlockedDeposit = _deposit - _lockedDeposit;
    }

    function addSyntheticAsset(ISyntheticAsset _synthetic) external {
        revert("mock-does-not-implement");
    }

    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset) external returns (uint256 _maxIssuable) {
        revert("mock-does-not-implement");
    }

    function maxIssuableForUsingLatestPrices(address _account, ISyntheticAsset _syntheticAsset)
        external
        view
        returns (uint256 _maxIssuable, bool _anyPriceInvalid)
    {
        revert("mock-does-not-implement");
    }

    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount) external {
        revert("mock-does-not-implement");
    }

    function refinance(ISyntheticAsset _syntheticAssetIn, uint256 _amountToRefinance) external {
        revert("mock-does-not-implement");
    }

    function removeSyntheticAsset(ISyntheticAsset _synthetic) external {
        revert("mock-does-not-implement");
    }

    function repay(ISyntheticAsset _syntheticAsset, uint256 _amount) external {
        revert("mock-does-not-implement");
    }

    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay
    ) external {
        revert("mock-does-not-implement");
    }

    function swap(
        ISyntheticAsset _syntheticAssetIn,
        ISyntheticAsset _syntheticAssetOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut) {
        revert("mock-does-not-implement");
    }

    function updateDepositFee(uint256 _newDepositFee) external {
        revert("mock-does-not-implement");
    }

    function updateDepositToken(IDepositToken _newDepositToken) external {
        revert("mock-does-not-implement");
    }

    function updateLiquidateFee(uint256 _newLiquidateFee) external {
        revert("mock-does-not-implement");
    }

    function updateLiquidatorFee(uint256 _newLiquidatorFee) external {
        revert("mock-does-not-implement");
    }

    function updateMaxLiquidable(uint256 _newMaxLiquidable) external {
        revert("mock-does-not-implement");
    }

    function updateMintFee(uint256 _newMintFee) external {
        revert("mock-does-not-implement");
    }

    function updateOracle(IOracle _newOracle) external {
        revert("mock-does-not-implement");
    }

    function updateRefinanceFee(uint256 _newRefinanceFee) external {
        revert("mock-does-not-implement");
    }

    function updateRepayFee(uint256 _newRepayFee) external {
        revert("mock-does-not-implement");
    }

    function updateSwapFee(uint256 _newSwapFee) external {
        revert("mock-does-not-implement");
    }

    function updateWithdrawFee(uint256 _newWithdrawFee) external {
        revert("mock-does-not-implement");
    }

    function updateTreasury(address _newTreasury) external {
        revert("mock-does-not-implement");
    }

    function withdraw(uint256 _amount) external {
        revert("mock-does-not-implement");
    }
}
