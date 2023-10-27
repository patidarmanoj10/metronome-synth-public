// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./CrossChains.t.sol";

error SwapFeatureIsInactive();

contract MultiPool_Test is CrossChains_Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    function setUp() public override {
        super.setUp();

        vm.selectFork(optimismFork);

        deal(address(vaUSDC_optimism), alice, 1000000e18);

        vm.startPrank(alice);
        vaUSDC_optimism.approve(address(msdVaUSDC_optimism), type(uint256).max);
        vaUSDC_optimism.approve(address(msdVaUSDC_B_optimism), type(uint256).max);
        vm.stopPrank();
    }

    // PoolA (swap OK) & PoolB (swap inactive)
    function test_swap() external {
        // given
        vm.startPrank(alice);
        vaUSDC_optimism.approve(address(msdVaUSDC_optimism), 1000e18);
        msdVaUSDC_optimism.deposit(1000e18, alice);
        msUSDDebt_optimism.issue(500e18, alice);

        assertEq(msUSD_optimism.balanceOf(alice), 500e18);
        assertTrue(pool_optimism.isSwapActive());
        assertFalse(pool_B_optimism.isSwapActive());

        // when-then
        assertEq(msBTC_optimism.balanceOf(alice), 0);
        pool_optimism.swap(msUSD_optimism, msBTC_optimism, 100e18);
        assertGt(msBTC_optimism.balanceOf(alice), 0);

        vm.expectRevert(SwapFeatureIsInactive.selector);
        pool_B_optimism.swap(msUSD_optimism, msETH_optimism, 100e18);
        vm.stopPrank();
    }

    // PoolA (10% deposit fee) & PoolB (25% deposit fee)
    function test_fees() external {
        // given
        feeProvider_optimism.updateDepositFee(0.1e18);
        feeProvider_B_optimism.updateDepositFee(0.25e18);
        uint256 msdVaUSDC_A_before = msdVaUSDC_optimism.balanceOf(alice);
        uint256 msdVaUSDC_B_before = msdVaUSDC_B_optimism.balanceOf(alice);

        // when
        uint256 amount = 100e18;

        vm.startPrank(alice);
        msdVaUSDC_optimism.deposit(amount, alice);
        msdVaUSDC_B_optimism.deposit(amount, alice);
        vm.stopPrank();

        // then
        uint256 msdVaUSDC_A_deposits = msdVaUSDC_optimism.balanceOf(alice) - msdVaUSDC_A_before;
        uint256 msdVaUSDC_B_deposits = msdVaUSDC_B_optimism.balanceOf(alice) - msdVaUSDC_B_before;
        assertEq(msdVaUSDC_A_deposits, 90e18);
        assertEq(msdVaUSDC_B_deposits, 75e18);
    }

    // PoolA (50% CF) & PoolB (10% CF)
    function test_cfs() external {
        // given
        msdVaUSDC_optimism.updateCollateralFactor(0.6e18);
        msdVaUSDC_B_optimism.updateCollateralFactor(0.1e18);
        vm.startPrank(alice);

        // when
        msdVaUSDC_optimism.deposit(100e18, alice);
        msdVaUSDC_B_optimism.deposit(100e18, alice);
        vm.stopPrank();

        // then
        // Note: Mocked price for vaUSDC is $1
        (uint256 _depositAInUsd, uint256 _issuableLimitAInUsd) = pool_optimism.depositOf(alice);
        assertEq(_depositAInUsd, 100e18);
        assertEq(_issuableLimitAInUsd, 60e18);

        (uint256 _depositBInUsd, uint256 _issuableLimitBInUsd) = pool_B_optimism.depositOf(alice);
        assertEq(_depositBInUsd, 100e18);
        assertEq(_issuableLimitBInUsd, 10e18);
    }

    // Both pools issue msUSD
    function test_shared_synth() external {
        // given
        assertTrue(pool_optimism.doesSyntheticTokenExist(msUSD_optimism));
        assertTrue(pool_B_optimism.doesSyntheticTokenExist(msUSD_optimism));
        vm.startPrank(alice);
        msdVaUSDC_optimism.deposit(1000e18, alice);
        msdVaUSDC_B_optimism.deposit(1000e18, alice);

        // when
        msUSDDebt_optimism.issue(100e18, alice);
        msUSDDebt_B_optimism.issue(100e18, alice);
        vm.stopPrank();

        // then
        assertEq(msUSD_optimism.balanceOf(alice), 200e18);
        assertEq(msUSDDebt_optimism.balanceOf(alice), 100e18);
        assertEq(msUSDDebt_B_optimism.balanceOf(alice), 100e18);
    }

    // PoolA (5% APR) & PoolB (10% APR)
    function test_interests() external {
        // given
        msUSDDebt_optimism.updateInterestRate(0.05e18);
        msUSDDebt_B_optimism.updateInterestRate(0.10e18);
        vm.startPrank(alice);
        msdVaUSDC_optimism.deposit(1000e18, alice);
        msdVaUSDC_B_optimism.deposit(1000e18, alice);

        // when
        msUSDDebt_optimism.issue(100e18, alice);
        msUSDDebt_B_optimism.issue(100e18, alice);
        vm.stopPrank();
        assertEq(msUSD_optimism.balanceOf(alice), 200e18);
        assertEq(msUSDDebt_optimism.balanceOf(alice), 100e18);
        assertEq(msUSDDebt_B_optimism.balanceOf(alice), 100e18);
        vm.warp(block.timestamp + 365 days);

        // then
        assertEq(msUSD_optimism.balanceOf(alice), 200e18);
        assertApproxEqAbs(msUSDDebt_optimism.balanceOf(alice), 105e18, 1e18);
        assertApproxEqAbs(msUSDDebt_B_optimism.balanceOf(alice), 110e18, 1e18);
    }

    // PoolA (msUSD+msBTC) & PoolB (msUSD+msETH)
    function test_isolated_synth() external {
        // given
        assertTrue(poolRegistry_optimism.doesSyntheticTokenExist(msUSD_optimism));
        assertTrue(poolRegistry_optimism.doesSyntheticTokenExist(msBTC_optimism));
        assertTrue(poolRegistry_optimism.doesSyntheticTokenExist(msETH_optimism));

        assertTrue(pool_optimism.doesSyntheticTokenExist(msUSD_optimism));
        assertTrue(pool_optimism.doesSyntheticTokenExist(msBTC_optimism));
        assertFalse(pool_optimism.doesSyntheticTokenExist(msETH_optimism));

        assertTrue(pool_B_optimism.doesSyntheticTokenExist(msUSD_optimism));
        assertFalse(pool_B_optimism.doesSyntheticTokenExist(msBTC_optimism));
        assertTrue(pool_B_optimism.doesSyntheticTokenExist(msETH_optimism));

        vm.startPrank(alice);
        msdVaUSDC_optimism.deposit(100000e18, alice);
        msdVaUSDC_B_optimism.deposit(100000e18, alice);

        // when
        msBTCDebt_optimism.issue(1e8, alice);
        msETHDebt_B_optimism.issue(1e18, alice);

        // then
        // Note: Mocked prices: BTC = $30K and ETH = $2K
        assertEq(pool_optimism.debtOf(alice), 30000e18);
        assertEq(pool_B_optimism.debtOf(alice), 2000e18);
    }

    // Initiate cross-chain leverage operation from PoolB
    function test_cross_chain() external {
        //
        // given
        //
        vm.selectFork(optimismFork);
        (, uint256 _depositInUsdBefore, uint256 _debtInUsdBefore, , ) = pool_B_optimism.debtPositionOf(alice);
        assertEq(_depositInUsdBefore, 0);
        assertEq(_debtInUsdBefore, 0);

        //
        // tx1
        //
        vm.selectFork(mainnetFork);
        crossChainDispatcher_mainnet.updateLeverageCallbackTxGasLimit(1_000_000);
        bytes memory _lzArgs = poolRegistry_mainnet.quoter().getLeverageSwapAndCallbackLzArgs({
            srcChainId_: LZ_OP_CHAIN_ID,
            dstChainId_: LZ_MAINNET_CHAIN_ID
        });

        vm.selectFork(optimismFork);
        uint256 fee = poolRegistry_optimism.quoter().quoteCrossChainLeverageNativeFee({
            proxyOFT_: proxyOFT_msUSD_optimism,
            lzArgs_: _lzArgs
        });

        uint256 _amountIn = 1000e6;

        deal(alice, fee);
        deal(address(usdc_optimism), alice, _amountIn);

        vm.recordLogs();
        vm.startPrank(alice);
        usdc_optimism.approve(address(smartFarmingManager_B_optimism), type(uint256).max);
        smartFarmingManager_B_optimism.crossChainLeverage{value: fee}({
            tokenIn_: usdc_optimism,
            syntheticToken_: msUSD_optimism,
            bridgeToken_: usdc_optimism,
            depositToken_: msdVaUSDC_B_optimism,
            amountIn_: _amountIn,
            leverage_: 1.5e18,
            depositAmountMin_: 0,
            swapAmountOutMin_: 0,
            lzArgs_: _lzArgs
        });
        vm.stopPrank();
        (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getOftTransferEvents();

        //
        // tx2
        //
        _executeOftTransferArrivalTx(SendToChain, Packet, RelayerParams);
        (Vm.Log memory Swap, Vm.Log memory Packet_Tx2, Vm.Log memory RelayerParams_Tx2) = _getSgSwapEvents();

        //
        // tx3
        //
        _executeSgSwapArrivalTx(Swap, Packet_Tx2, RelayerParams_Tx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_B_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertEq(_debtInUsdAfter, 500e18);
    }
}
