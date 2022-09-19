// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name
// solhint-disable no-empty-blocks

pragma solidity 0.8.9;

import "../lib/WadRayMath.sol";
import "../Pausable.sol";
import "../interfaces/IController.sol";
import "../access/Governable.sol";

contract ControllerMock is IController, Governable, Pausable {
    using WadRayMath for uint256;

    ITreasury public treasury;
    ISyntheticToken public syntheticToken;
    IDepositToken public depositToken;
    IMasterOracle public masterOracle;
    uint256 public issueFee;
    uint256 public depositFee;
    uint256 public repayFee;
    uint256 public withdrawFee;
    uint256 public debtFloorInUsd;

    constructor(
        IDepositToken _depositToken,
        IMasterOracle _masterOracle,
        ISyntheticToken _syntheticToken
    ) {
        depositToken = _depositToken;
        masterOracle = _masterOracle;
        syntheticToken = _syntheticToken;
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

    function getDepositTokens() external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function getDebtTokens() external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function debtOf(address _account) public view override returns (uint256 _debtInUsd) {
        if (address(syntheticToken) != address(0)) {
            uint256 _debtBalance = syntheticToken.debtToken().balanceOf(_account);
            return masterOracle.quoteTokenToUsd(address(syntheticToken), _debtBalance);
        }
    }

    function depositOf(address) external pure override returns (uint256, uint256) {
        revert("mock-does-not-implement");
    }

    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _depositInUsd,
            uint256 _debtInUsd,
            uint256 _issuableLimitInUsd,
            uint256 _issuableInUsd
        )
    {
        _isHealthy = true;
        uint256 _deposit = depositToken.balanceOf(_account);
        _depositInUsd = masterOracle.quoteTokenToUsd(address(depositToken), _deposit);
        _debtInUsd = debtOf(_account);
        _issuableLimitInUsd = _depositInUsd.wadMul(depositToken.collateralizationRatio());
        _issuableInUsd = _debtInUsd < _issuableLimitInUsd ? _issuableLimitInUsd - _debtInUsd : 0;
    }

    function addDebtToken(IDebtToken) external pure override {
        revert("mock-does-not-implement");
    }

    function removeDebtToken(IDebtToken) external pure override {
        revert("mock-does-not-implement");
    }

    function addDepositToken(address) external pure override {
        revert("mock-does-not-implement");
    }

    function removeDepositToken(IDepositToken) external pure override {
        revert("mock-does-not-implement");
    }

    function liquidate(
        ISyntheticToken,
        address,
        uint256,
        IDepositToken
    ) external pure override {
        revert("mock-does-not-implement");
    }

    function swap(
        ISyntheticToken,
        ISyntheticToken,
        uint256
    ) external pure override returns (uint256) {
        revert("mock-does-not-implement");
    }

    function updateMasterOracle(IMasterOracle _newMasterOracle) external {
        masterOracle = _newMasterOracle;
    }

    function updateDebtFloor(uint256 _newDebtFloorInUsd) external override {
        debtFloorInUsd = _newDebtFloorInUsd;
    }

    function updateDepositFee(uint256 _newDepositFee) external override {
        depositFee = _newDepositFee;
    }

    function updateIssueFee(uint256 _newIssueFee) external override {
        issueFee = _newIssueFee;
    }

    function updateWithdrawFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateRepayFee(uint256 _newRepayFee) external override {
        repayFee = _newRepayFee;
    }

    function updateSwapFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateLiquidatorLiquidationFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateProtocolLiquidationFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateMaxLiquidable(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function isSyntheticTokenExists(ISyntheticToken _syntheticToken) external view override returns (bool) {
        return address(_syntheticToken) == address(syntheticToken);
    }

    function isDebtTokenExists(IDebtToken) external pure returns (bool) {
        return true;
    }

    function isDepositTokenExists(IDepositToken) external pure override returns (bool) {
        return true;
    }

    function updateTreasury(ITreasury _treasury) external override {
        treasury = _treasury;
    }

    function debtTokenOf(ISyntheticToken) external pure override returns (IDebtToken) {
        revert("mock-does-not-implement");
    }

    function depositTokenOf(IERC20) external view override returns (IDepositToken) {
        return depositToken;
    }

    function addToDepositTokensOfAccount(address) external pure override {}

    function removeFromDepositTokensOfAccount(address) external pure override {}

    function addToDebtTokensOfAccount(address) external pure override {}

    function removeFromDebtTokensOfAccount(address) external pure override {}

    function getDepositTokensOfAccount(address) external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function getDebtTokensOfAccount(address) external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function addRewardsDistributor(IRewardsDistributor) external pure override {
        revert("mock-does-not-implement");
    }

    function getRewardsDistributors()
        external
        pure
        override
        returns (IRewardsDistributor[] memory _rewardsDistributors)
    {}
}
