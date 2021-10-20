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
            uint256,
            uint256,
            bool
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

    function addSyntheticAsset(ISyntheticAsset) external pure {
        revert("mock-does-not-implement");
    }

    function maxIssuableFor(address, ISyntheticAsset) external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function maxIssuableForUsingLatestPrices(address, ISyntheticAsset) external pure returns (uint256, bool) {
        revert("mock-does-not-implement");
    }

    function mint(ISyntheticAsset, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function refinance(ISyntheticAsset, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function removeSyntheticAsset(ISyntheticAsset) external pure {
        revert("mock-does-not-implement");
    }

    function repay(ISyntheticAsset, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function liquidate(
        ISyntheticAsset,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function swap(
        ISyntheticAsset,
        ISyntheticAsset,
        uint256
    ) external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function updateDepositFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateDepositToken(IDepositToken) external pure {
        revert("mock-does-not-implement");
    }

    function updateLiquidateFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateLiquidatorFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateMaxLiquidable(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateMintFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateOracle(IOracle) external pure {
        revert("mock-does-not-implement");
    }

    function updateRefinanceFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateRepayFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateSwapFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateWithdrawFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateTreasury(address) external pure {
        revert("mock-does-not-implement");
    }

    function withdraw(uint256) external pure {
        revert("mock-does-not-implement");
    }
}
