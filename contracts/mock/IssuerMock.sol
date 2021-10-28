// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name

pragma solidity 0.8.9;

import "../interface/IIssuer.sol";
import "../interface/IDepositToken.sol";

contract IssuerMock is IIssuer {
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

    function syntheticAssetsMintedBy(address) external pure returns (ISyntheticAsset[] memory) {
        revert("mock-does-not-implement");
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

    function removeSyntheticAsset(ISyntheticAsset) external pure {
        revert("mock-does-not-implement");
    }

    function updateOracle(IOracle) external pure {
        revert("mock-does-not-implement");
    }

    function mEth() external pure returns (ISyntheticAsset) {
        revert("mock-does-not-implement");
    }

    function met() external pure returns (IERC20) {
        revert("mock-does-not-implement");
    }

    function mintSyntheticAssetAndDebtToken(
        ISyntheticAsset,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function burnSyntheticAssetAndDebtToken(
        ISyntheticAsset,
        address,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function mintDepositToken(address, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function collectFee(
        address,
        uint256,
        bool
    ) external pure {
        revert("mock-does-not-implement");
    }

    function burnWithdrawnDeposit(address, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function seizeDepositToken(
        address,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function updateDepositToken(IDepositToken) external pure {
        revert("mock-does-not-implement");
    }

    function isSyntheticAssetExists(ISyntheticAsset) external pure returns (bool) {
        revert("mock-does-not-implement");
    }
}
