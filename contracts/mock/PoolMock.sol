// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name
// solhint-disable no-empty-blocks

pragma solidity 0.8.9;

import "../lib/WadRayMath.sol";
import "../utils/Pauseable.sol";
import "../interfaces/IPool.sol";
import "../access/Governable.sol";

contract PoolMock is IPool, Governable, Pauseable {
    using WadRayMath for uint256;

    ITreasury public treasury;
    ISyntheticToken public syntheticToken;
    IDebtToken public debtToken;
    IDepositToken public depositToken;
    IMasterOracle public masterOracle;
    IPoolRegistry public poolRegistry;
    uint256 public issueFee;
    uint256 public depositFee;
    uint256 public repayFee;
    uint256 public withdrawFee;
    uint256 public debtFloorInUsd;
    uint256 public swapFee;
    uint256 public maxLiquidable;
    bool public isSwapActive;

    constructor(
        IDepositToken _depositToken,
        IMasterOracle _masterOracle,
        ISyntheticToken _syntheticToken,
        IDebtToken _debtToken,
        IPoolRegistry _poolRegistry
    ) {
        depositToken = _depositToken;
        masterOracle = _masterOracle;
        syntheticToken = _syntheticToken;
        debtToken = _debtToken;
        poolRegistry = _poolRegistry;
    }

    function feeCollector() external view returns (address) {
        return poolRegistry.feeCollector();
    }

    function getDepositTokens() external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function getDebtTokens() external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function debtOf(address _account) public view override returns (uint256 _debtInUsd) {
        if (address(syntheticToken) != address(0)) {
            uint256 _debtBalance = debtToken.balanceOf(_account);
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
        _depositInUsd = masterOracle.quoteTokenToUsd(address(depositToken.underlying()), _deposit);
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

    function updateLiquidatorLiquidationFee(uint128) external pure override {
        revert("mock-does-not-implement");
    }

    function updateProtocolLiquidationFee(uint128) external pure override {
        revert("mock-does-not-implement");
    }

    function updateSwapFee(uint256) external pure override {
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

    function debtTokenOf(ISyntheticToken) external view override returns (IDebtToken) {
        return debtToken;
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

    function removeRewardsDistributor(IRewardsDistributor) external pure override {
        revert("mock-does-not-implement");
    }

    function getRewardsDistributors()
        external
        pure
        override
        returns (IRewardsDistributor[] memory _rewardsDistributors)
    {}

    function toggleIsSwapActive() external pure override {
        revert("mock-does-not-implement");
    }
}
