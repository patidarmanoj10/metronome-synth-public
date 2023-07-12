// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./CrossChains.t.sol";

contract Layer2FlashRepay_Test is CrossChains_Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    function _depositAndIssue(uint256 depositAmount_, uint256 issueAmount_) private {
        vm.selectFork(optimismFork);

        vm.startPrank(alice);
        deal(address(vaUSDC_optimism), alice, depositAmount_);
        vaUSDC_optimism.approve(address(msdVaUSDC_optimism), type(uint256).max);
        msdVaUSDC_optimism.deposit(depositAmount_, alice);
        msUSDDebt_optimism.issue(issueAmount_, alice);
    }

    function _layer2FlashRepay(
        uint256 withdrawAmount_,
        uint256 layer1SwapAmountOutMin_,
        uint256 repayAmountMin_
    ) private {
        vm.recordLogs();

        vm.selectFork(mainnetFork);
        bytes memory _lzArgs = proxyOFT_msUSD_mainnet.getFlashRepaySwapAndCallbackLzArgs(LZ_OP_CHAIN_ID);

        vm.selectFork(optimismFork);
        uint256 fee = smartFarmingManager_optimism.quoteLayer2FlashRepayNativeFee({
            syntheticToken_: msUSD_optimism,
            lzArgs_: _lzArgs
        });
        deal(alice, fee);

        vm.startPrank(alice);
        usdc_optimism.approve(address(pool_optimism), type(uint256).max);
        smartFarmingManager_optimism.layer2FlashRepay{value: fee}({
            syntheticToken_: msUSD_optimism,
            depositToken_: msdVaUSDC_optimism,
            withdrawAmount_: withdrawAmount_,
            underlying_: usdc_optimism,
            underlyingAmountMin_: 0,
            repayAmountMin_: repayAmountMin_,
            layer1SwapAmountOutMin_: layer1SwapAmountOutMin_,
            layer1LzArgs_: _lzArgs
        });
        vm.stopPrank();

        assertEq(alice.balance, 0, "fee-estimation-is-not-accurate");
    }

    function _executeSwapAndTriggerCallback(
        Vm.Log memory Swap,
        Vm.Log memory Packet,
        Vm.Log memory RelayerParams
    ) internal {
        _executeSgSwapArrivalTx(Swap, Packet, RelayerParams);
    }

    function _executeCallback(Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) internal {
        _executeOftTransferArrivalTx(SendToChain, Packet, RelayerParams);
    }

    function test_layer2FlashRepay() external {
        //
        // given
        //
        _depositAndIssue({depositAmount_: 2000e18, issueAmount_: 500e18});
        (, uint256 _depositInUsdBefore, uint256 _debtInUsdBefore, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdBefore, 2000e18, 1e18);
        assertApproxEqAbs(_debtInUsdBefore, 500e18, 1e18);

        //
        // when
        //

        // tx1
        _layer2FlashRepay({withdrawAmount_: 500e18, layer1SwapAmountOutMin_: 0, repayAmountMin_: 0});
        (Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getSgSwapEvents();

        // tx2
        _executeSwapAndTriggerCallback(Swap, Packet, RelayerParams);
        (Vm.Log memory SendToChain, Vm.Log memory PacketTx2, Vm.Log memory RelayerParamsTx2) = _getOftTransferEvents();

        // tx3
        _executeCallback(SendToChain, PacketTx2, RelayerParamsTx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertApproxEqAbs(_debtInUsdAfter, 0, 1e18);
        assertEq(address(proxyOFT_msUSD_mainnet).balance, 0, "fee-estimation-is-not-accurate");
    }

    function test_failedTx2_whenUnderlyingTransferReverted() external {
        //
        // given
        //

        vm.selectFork(mainnetFork);
        uint256 amountInUsdc = usdc_mainnet.balanceOf(SG_MAINNET_USDC_POOL) * 4;
        vm.selectFork(optimismFork);
        // Making amount to bridge from L2 to mainnet be higher than the SG Pool liquidity
        _addSgLiquidity(SG_OP_USDC_POOL, amountInUsdc);
        uint256 amountInVaUSDC = masterOracle_optimism.quote(
            address(usdc_optimism),
            address(vaUSDC_optimism),
            amountInUsdc
        );
        uint256 amountInMsUSD = masterOracle_optimism.quote(
            address(usdc_optimism),
            address(msUSD_optimism),
            amountInUsdc
        );
        _depositAndIssue({depositAmount_: amountInVaUSDC, issueAmount_: amountInMsUSD / 2});
        uint256 debtInUsdBefore = pool_optimism.debtOf(alice);

        //
        // when
        //

        // tx1
        _layer2FlashRepay({withdrawAmount_: amountInVaUSDC / 2, layer1SwapAmountOutMin_: 0, repayAmountMin_: 0});
        (Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getSgSwapEvents();

        // tx2 - fail
        _executeSwapAndTriggerCallback(Swap, Packet, RelayerParams);
        (, Vm.Log memory Revert) = _getSgSwapErrorEvents();
        assertGt(Revert.data.length, 0); // Emitted `Revert` event
        (uint16 chainId, bytes memory srcAddress, uint256 nonce) = _decodeRevertEvent(Revert);

        // tx2 - fail
        // Same state, retry will fail too
        sgRouter_mainnet.retryRevert(chainId, srcAddress, nonce);
        (, Revert) = _getSgSwapErrorEvents();
        assertGt(Revert.data.length, 0); // Emitted `Revert` event

        // tx2
        // Retry will work after adding liquidity to the SG Pool
        _addSgLiquidity(SG_MAINNET_USDC_POOL, amountInUsdc);
        sgRouter_mainnet.retryRevert(chainId, srcAddress, nonce);
        (
            Vm.Log memory SendToChain,
            Vm.Log memory Packet_Tx2,
            Vm.Log memory RelayerParams_Tx2
        ) = _getOftTransferEvents();

        // tx3
        _executeCallback(SendToChain, Packet_Tx2, RelayerParams_Tx2);

        //
        // then
        //
        vm.selectFork(optimismFork);
        uint256 debtInUsdAfter = pool_optimism.debtOf(alice);
        assertLt(debtInUsdAfter, debtInUsdBefore);
    }

    function test_failedTx2_whenSgReceiveReverted() external {
        //
        // given
        //
        _depositAndIssue({depositAmount_: 2000e18, issueAmount_: 500e18});
        (, uint256 _depositInUsdBefore, uint256 _debtInUsdBefore, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdBefore, 2000e18, 1e18);
        assertApproxEqAbs(_debtInUsdBefore, 500e18, 1e18);

        //
        // when
        //

        // tx1
        // `layer1SwapAmountOutMin_` too high
        _layer2FlashRepay({withdrawAmount_: 500e18, layer1SwapAmountOutMin_: 500e18, repayAmountMin_: 0});
        (Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getSgSwapEvents();

        // tx2 - fail
        _executeSwapAndTriggerCallback(Swap, Packet, RelayerParams);
        (Vm.Log memory CachedSwapSaved, ) = _getSgSwapErrorEvents();
        assertGt(CachedSwapSaved.data.length, 0); // Emitted `Revert` event
        (uint16 chainId, bytes memory srcAddress, uint256 nonce, , , , , ) = _decodeCachedSwapSavedEvent(
            CachedSwapSaved
        );

        // tx2
        // Retry will work after amending slippage
        vm.prank(alice);
        proxyOFT_msUSD_mainnet.retrySwapUnderlyingAndTriggerCallback(
            chainId,
            srcAddress,
            nonce,
            480e18 // Correct slippage
        );

        (Vm.Log memory SendToChain, Vm.Log memory PacketTx2, Vm.Log memory RelayerParamsTx2) = _getOftTransferEvents();

        // tx3
        _executeCallback(SendToChain, PacketTx2, RelayerParamsTx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertApproxEqAbs(_debtInUsdAfter, 0, 1e18);
        assertEq(address(proxyOFT_msUSD_mainnet).balance, 0, "fee-estimation-is-not-accurate");
    }

    function test_failedTx3_whenSynthTransferReverted() external {
        //
        // given
        //

        // It will make OP's bridge minting to fail
        vm.selectFork(optimismFork);
        msUSD_optimism.updateMaxBridgingBalance(0);

        _depositAndIssue({depositAmount_: 2000e18, issueAmount_: 500e18});

        //
        // when
        //

        // tx1
        _layer2FlashRepay({withdrawAmount_: 500e18, layer1SwapAmountOutMin_: 0, repayAmountMin_: 0});
        (Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getSgSwapEvents();

        // tx2
        _executeSwapAndTriggerCallback(Swap, Packet, RelayerParams);
        (
            Vm.Log memory SendToChain,
            Vm.Log memory Packet_Tx2,
            Vm.Log memory RelayerParams_Tx2
        ) = _getOftTransferEvents();

        // tx3 - fail
        _executeCallback(SendToChain, Packet_Tx2, RelayerParams_Tx2);
        (Vm.Log memory MessageFailed, ) = _getOftTransferErrorEvents();
        (uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload, bytes memory reason) = abi
            .decode(MessageFailed.data, (uint16, bytes, uint64, bytes, bytes));
        assertEq(reason, abi.encodeWithSignature("SurpassMaxBridgingBalance()"));

        // tx3 - fail
        // Same state, retry will fail too
        vm.expectRevert();
        proxyOFT_msUSD_optimism.retryMessage(_srcChainId, _srcAddress, _nonce, _payload);

        // tx3
        // Retry will work after amending state
        msUSD_optimism.updateMaxBridgingBalance(type(uint256).max);
        proxyOFT_msUSD_optimism.retryMessage(_srcChainId, _srcAddress, _nonce, _payload);

        //
        // then
        //
        assertApproxEqAbs(pool_optimism.debtOf(alice), 0, 1e18);
    }

    function test_failedTx3_whenOnOFTReceivedReverted() external {
        //
        // given
        //
        _depositAndIssue({depositAmount_: 2000e18, issueAmount_: 500e18});

        //
        // when
        //

        // tx1
        // Using too high `repayAmountMin_`
        _layer2FlashRepay({withdrawAmount_: 500e18, layer1SwapAmountOutMin_: 0, repayAmountMin_: 500e18});
        (Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getSgSwapEvents();

        // tx2
        _executeSwapAndTriggerCallback(Swap, Packet, RelayerParams);
        (
            Vm.Log memory SendToChain,
            Vm.Log memory Packet_Tx2,
            Vm.Log memory RelayerParams_Tx2
        ) = _getOftTransferEvents();

        // tx3 - fail
        _executeCallback(SendToChain, Packet_Tx2, RelayerParams_Tx2);
        (, Vm.Log memory CallOFTReceivedFailure) = _getOftTransferErrorEvents();

        (
            uint16 srcChainId,
            address to,
            bytes memory srcAddress,
            uint64 nonce,
            bytes memory from,
            uint amount,
            bytes memory payload,
            bytes memory reason
        ) = _decodeCallOFTReceivedFailureEvent(CallOFTReceivedFailure);
        assertEq(reason, abi.encodeWithSignature("FlashRepaySlippageTooHigh()"));

        // tx3 - fail
        // Same state, retry will fail too
        vm.expectRevert();
        proxyOFT_msUSD_optimism.retryOFTReceived(srcChainId, srcAddress, nonce, from, to, amount, payload);

        // tx3
        // Retry will work after fix slippage
        vm.prank(alice);
        smartFarmingManager_optimism.retryLayer2FlashRepayCallback(
            1, // request id
            490e18, // right `repayAmountMin_`
            srcChainId,
            srcAddress,
            nonce,
            amount,
            payload
        );

        //
        // then
        //
        assertApproxEqAbs(pool_optimism.debtOf(alice), 0, 1e18);
    }
}
