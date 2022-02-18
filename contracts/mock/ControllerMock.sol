// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name
// solhint-disable no-empty-blocks

pragma solidity 0.8.9;

import "../interface/IController.sol";
import "../interface/IGovernable.sol";

contract ControllerMock is IController, IGovernable {
    ITreasury public treasury;
    IDepositToken public depositToken;
    IMasterOracle public oracle;
    address public governor;

    constructor(
        IDepositToken _depositToken,
        IMasterOracle _oracle,
        ITreasury _treasury
    ) {
        depositToken = _depositToken;
        oracle = _oracle;
        treasury = _treasury;
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

    function getSyntheticTokens() external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function debtOf(address) external pure override returns (uint256) {
        revert("mock-does-not-implement");
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
            uint256 _mintableLimitInUsd,
            uint256 _mintableInUsd
        )
    {
        _isHealthy = true;
        uint256 _deposit = depositToken.balanceOf(_account);
        _depositInUsd = oracle.convertToUsd(depositToken, _deposit);
        _debtInUsd = 0;
        _mintableLimitInUsd = _depositInUsd;
        _mintableInUsd = _mintableLimitInUsd;
    }

    function addSyntheticToken(address) external pure override {
        revert("mock-does-not-implement");
    }

    function removeSyntheticToken(ISyntheticToken) external pure override {
        revert("mock-does-not-implement");
    }

    function addDepositToken(address) external pure override {
        revert("mock-does-not-implement");
    }

    function removeDepositToken(IDepositToken) external pure override {
        revert("mock-does-not-implement");
    }

    function deposit(
        IDepositToken _depositToken,
        uint256 _amount,
        address _onBehalfOf
    ) external override {
        _depositToken.underlying().transferFrom(msg.sender, address(this), _amount);
        _depositToken.mint(_onBehalfOf, _amount);
    }

    function mint(
        ISyntheticToken,
        uint256,
        address
    ) external pure override {
        revert("mock-does-not-implement");
    }

    function withdraw(
        IDepositToken _depositToken,
        uint256 _amount,
        address _to
    ) external override {
        _depositToken.burn(msg.sender, _amount);
        _depositToken.underlying().transfer(_to, _amount);
    }

    function repay(
        ISyntheticToken,
        address,
        uint256
    ) external pure override {
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

    function updateOracle(IMasterOracle) external pure {
        revert("mock-does-not-implement");
    }

    function updateDebtFloor(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateDepositFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateMintFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateWithdrawFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateRepayFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateSwapFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateLiquidatorFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateLiquidateFee(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function updateMaxLiquidable(uint256) external pure override {
        revert("mock-does-not-implement");
    }

    function isSyntheticTokenExists(ISyntheticToken) external pure override returns (bool) {
        revert("mock-does-not-implement");
    }

    function isDepositTokenExists(IDepositToken) external pure override returns (bool) {
        revert("mock-does-not-implement");
    }

    function updateTreasury(ITreasury, bool) external pure override {
        revert("mock-does-not-implement");
    }

    function depositTokenOf(IERC20) external view override returns (IDepositToken) {
        return depositToken;
    }

    function transferGovernorship(address _governor) public override {
        governor = _governor;
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
}
