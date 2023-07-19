// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./CrossChains.t.sol";

contract CrossChainTransfers_Test is CrossChains_Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 constant LZ_ADAPTER_PARAMS_VERSION = 1;
    uint16 constant PT_SEND = 0;
    uint256 constant SIMPLE_TRANSFER_GAS = 200_000;

    function _issueOnMainnet(uint256 _issueAmount) private {
        vm.selectFork(mainnetFork);

        uint256 _depositAmount = 1000e6;

        vm.startPrank(alice);
        deal(address(usdc_mainnet), alice, _depositAmount);
        usdc_mainnet.approve(address(msdUSDC_mainnet), type(uint256).max);
        msdUSDC_mainnet.deposit(_depositAmount, alice);
        msUSDDebt_mainnet.issue(_issueAmount, alice);
        vm.stopPrank();
    }

    function _issueOnOptimism(uint256 _issueAmount) private {
        vm.selectFork(optimismFork);

        uint256 _depositAmount = 1000e6;

        vm.startPrank(alice);
        deal(address(usdc_optimism), alice, _depositAmount);
        usdc_optimism.approve(address(msdUSDC_optimism), type(uint256).max);
        msdUSDC_optimism.deposit(_depositAmount, alice);
        msUSDDebt_optimism.issue(_issueAmount, alice);
        vm.stopPrank();
    }

    function test_transferSynthFromLayer1ToLayer2() external {
        vm.recordLogs();
        uint256 amount = 200e18;
        uint16 srcChainId = LZ_MAINNET_CHAIN_ID;
        uint16 dstChainId = LZ_OP_CHAIN_ID;

        //
        // given
        //
        _issueOnMainnet(amount);
        assertEq(msUSD_mainnet.balanceOf(alice), amount);
        vm.selectFork(optimismFork);
        assertEq(msUSD_optimism.balanceOf(alice), 0);

        //
        // when
        //
        bytes memory toAddress = abi.encodePacked(alice);
        {
            vm.selectFork(mainnetFork);
            bytes memory adapterParams = abi.encodePacked(LZ_ADAPTER_PARAMS_VERSION, SIMPLE_TRANSFER_GAS);
            (uint256 fee, ) = proxyOFT_msUSD_mainnet.estimateSendFee(
                dstChainId,
                toAddress,
                amount,
                false,
                adapterParams
            );

            vm.startPrank(alice);
            deal(alice, fee);
            proxyOFT_msUSD_mainnet.sendFrom{value: fee}(
                alice,
                dstChainId,
                toAddress,
                amount,
                payable(alice),
                address(0),
                adapterParams
            );
            vm.stopPrank();
        }

        address lzAppFrom = address(proxyOFT_msUSD_mainnet);
        address lzAppTo = address(proxyOFT_msUSD_optimism);

        vm.selectFork(optimismFork);
        vm.startPrank(lzEndpoint_optimism.defaultReceiveLibraryAddress());
        lzEndpoint_optimism.receivePayload({
            _srcChainId: srcChainId,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: lzEndpoint_optimism.getInboundNonce(srcChainId, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });

        //
        // then
        //
        assertEq(msUSD_optimism.balanceOf(alice), amount);
        vm.selectFork(mainnetFork);
        assertEq(msUSD_mainnet.balanceOf(alice), 0);
    }

    function test_revertWhenBridgingIsPaused_transferSynthFromLayer1ToLayer2() external {
        uint256 amount = 200e18;
        uint16 dstChainId = LZ_OP_CHAIN_ID;

        //
        // given
        //
        _issueOnMainnet(amount);

        //
        // when
        //
        poolRegistry_mainnet.toggleBridgingIsActive();

        //
        // then
        //
        bytes memory toAddress = abi.encodePacked(alice);
        bytes memory adapterParams = abi.encodePacked(LZ_ADAPTER_PARAMS_VERSION, SIMPLE_TRANSFER_GAS);
        (uint256 fee, ) = proxyOFT_msUSD_mainnet.estimateSendFee(dstChainId, toAddress, amount, false, adapterParams);

        deal(alice, fee);
        vm.startPrank(alice);
        vm.expectRevert(BridgingIsPaused.selector);
        proxyOFT_msUSD_mainnet.sendFrom{value: fee}(
            alice,
            dstChainId,
            toAddress,
            amount,
            payable(alice),
            address(0),
            adapterParams
        );
        vm.stopPrank();
    }

    function test_transferSynthFromLayer2ToLayer1() external {
        vm.recordLogs();
        uint256 amount = 200e18;
        uint16 srcChainId = LZ_OP_CHAIN_ID;
        uint16 dstChainId = LZ_MAINNET_CHAIN_ID;

        //
        // given
        //
        _issueOnOptimism(amount);
        assertEq(msUSD_optimism.balanceOf(alice), amount);
        vm.selectFork(mainnetFork);
        assertEq(msUSD_mainnet.balanceOf(alice), 0);

        //
        // when
        //
        bytes memory toAddress = abi.encodePacked(alice);
        {
            vm.selectFork(optimismFork);
            bytes memory adapterParams = abi.encodePacked(LZ_ADAPTER_PARAMS_VERSION, SIMPLE_TRANSFER_GAS);
            (uint256 fee, ) = proxyOFT_msUSD_optimism.estimateSendFee(
                dstChainId,
                toAddress,
                amount,
                false,
                adapterParams
            );

            vm.startPrank(alice);
            deal(alice, fee);
            proxyOFT_msUSD_optimism.sendFrom{value: fee}(
                alice,
                dstChainId,
                toAddress,
                amount,
                payable(alice),
                address(0),
                adapterParams
            );
            vm.stopPrank();
        }

        address lzAppFrom = address(proxyOFT_msUSD_optimism);
        address lzAppTo = address(proxyOFT_msUSD_mainnet);

        vm.selectFork(mainnetFork);
        vm.startPrank(lzEndpoint_mainnet.defaultReceiveLibraryAddress());
        lzEndpoint_mainnet.receivePayload({
            _srcChainId: srcChainId,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: lzEndpoint_mainnet.getInboundNonce(srcChainId, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });

        //
        // then
        //
        assertEq(msUSD_mainnet.balanceOf(alice), amount);
        vm.selectFork(optimismFork);
        assertEq(msUSD_optimism.balanceOf(alice), 0);
    }

    function test_revertWhenBridgingIsPaused_transferSynthFromLayer2ToLayer1() external {
        uint256 amount = 200e18;
        uint16 dstChainId = LZ_MAINNET_CHAIN_ID;

        //
        // given
        //
        _issueOnOptimism(amount);

        //
        // when
        //
        poolRegistry_optimism.toggleBridgingIsActive();

        //
        // then
        //
        bytes memory toAddress = abi.encodePacked(alice);
        bytes memory adapterParams = abi.encodePacked(LZ_ADAPTER_PARAMS_VERSION, SIMPLE_TRANSFER_GAS);
        (uint256 fee, ) = proxyOFT_msUSD_optimism.estimateSendFee(dstChainId, toAddress, amount, false, adapterParams);

        deal(alice, fee);
        vm.startPrank(alice);
        vm.expectRevert(BridgingIsPaused.selector);
        proxyOFT_msUSD_optimism.sendFrom{value: fee}(
            alice,
            dstChainId,
            toAddress,
            amount,
            payable(alice),
            address(0),
            adapterParams
        );
        vm.stopPrank();
    }
}
