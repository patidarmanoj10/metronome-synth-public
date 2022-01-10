// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name

pragma solidity 0.8.9;

import "../interface/IController.sol";

contract ControllerMock is IController {
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

    function getDepositTokens() external pure override returns (address[] memory) {
        revert("mock-does-not-implement");
    }

    function getSyntheticAssets() external pure override returns (address[] memory) {
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

    function depositOfUsingLatestPrices(address) external pure override returns (uint256, bool) {
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

    function syntheticAssetsMintedBy(address) external pure override returns (ISyntheticAsset[] memory) {
        revert("mock-does-not-implement");
    }

    function addSyntheticAsset(ISyntheticAsset) external pure override {
        revert("mock-does-not-implement");
    }

    function removeSyntheticAsset(ISyntheticAsset) external pure override {
        revert("mock-does-not-implement");
    }

    function addDepositToken(IDepositToken) external pure override {
        revert("mock-does-not-implement");
    }

    function removeDepositToken(IDepositToken) external pure override {
        revert("mock-does-not-implement");
    }

    function maxIssuableFor(address, ISyntheticAsset) external pure override returns (uint256) {
        revert("mock-does-not-implement");
    }

    function maxIssuableForUsingLatestPrices(address, ISyntheticAsset) external pure override returns (uint256, bool) {
        revert("mock-does-not-implement");
    }

    function deposit(
        IDepositToken _depositToken,
        uint256 _amount,
        address _onBehalfOf
    ) external {
        _depositToken.underlying().transferFrom(msg.sender, address(this), _amount);
        _depositToken.mint(_onBehalfOf, _amount);
    }

    function mint(ISyntheticAsset, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function withdraw(
        IDepositToken _depositToken,
        uint256 _amount,
        address _to
    ) external {
        _depositToken.burn(msg.sender, _amount);
        _depositToken.underlying().transfer(_to, _amount);
    }

    function repay(
        ISyntheticAsset,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function liquidate(
        ISyntheticAsset,
        address,
        uint256,
        IDepositToken
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

    function updateOracle(IOracle) external pure {
        revert("mock-does-not-implement");
    }

    function updateDepositFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateMintFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateWithdrawFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateRepayFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateSwapFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateLiquidatorFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateLiquidateFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateMaxLiquidable(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function isSyntheticAssetExists(ISyntheticAsset) external pure override returns (bool) {
        revert("mock-does-not-implement");
    }

    function isDepositTokenExists(IDepositToken) external pure override returns (bool) {
        revert("mock-does-not-implement");
    }

    function treasury() external pure override returns (ITreasury) {
        revert("mock-does-not-implement");
    }

    function updateTreasury(ITreasury) external pure override {
        revert("mock-does-not-implement");
    }

    function accrueInterest(ISyntheticAsset) external pure override {
        revert("mock-does-not-implement");
    }

    function depositTokenOf(IERC20) external view override returns (IDepositToken) {
        return depositToken;
    }
}
