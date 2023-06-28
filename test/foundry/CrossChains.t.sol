// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {BytesLib} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {Pool as StargatePool} from "../../contracts/dependencies/stargate-protocol/Pool.sol";
import {PoolRegistry} from "../../contracts/PoolRegistry.sol";
import {Pool, ISyntheticToken, IERC20} from "../../contracts/Pool.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {DepositToken} from "../../contracts/DepositToken.sol";
import {DebtToken} from "../../contracts/DebtToken.sol";
import {SyntheticToken} from "../../contracts/SyntheticToken.sol";
import {ProxyOFT, IStargateRouter} from "../../contracts/ProxyOFT.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {MasterOracleMock} from "../../contracts/mock/MasterOracleMock.sol";
import {LZEndpointMock, ILayerZeroEndpoint, ILayerZeroReceiver} from "../../contracts/mock/LZEndpointMock.sol";
import {SwapperMock, ISwapper} from "../../contracts/mock/SwapperMock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";
import {WadRayMath} from "../../contracts/lib/WadRayMath.sol";

interface ILayerZeroEndpointExtended is ILayerZeroEndpoint {
    function defaultReceiveLibraryAddress() external view returns (address);
}

interface IStargateRouterExtended is IStargateRouter {
    function bridge() external view returns (address);

    function swapRemote(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint256 _nonce,
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        uint256 _dstGasForCall,
        address _to,
        StargatePool.SwapObj memory _s,
        bytes memory _payload
    ) external;

    function retryRevert(uint16 _srcChainId, bytes calldata _srcAddress, uint256 _nonce) external payable;
}

contract CrossChains_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;
    uint16 public constant LZ_OP_CHAIN_ID = 111;

    uint256 public constant SG_MAINNET_USDC_POOL_ID = 1;
    uint256 public constant SG_OP_USDC_POOL_ID = 1;

    address public constant SG_OP_USDC_POOL = 0xDecC0c09c3B5f6e92EF4184125D5648a66E35298;
    address public constant SG_MAINNET_POLL = 0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56;

    address feeCollector = address(999);
    address alice = address(10);
    address bob = address(20);

    uint256 mainnetFork;
    uint256 optimismFork;

    // Layer 2
    IERC20 vaUSDC_optimism = IERC20(0x539505Dde2B9771dEBE0898a84441c5E7fDF6BC0);
    IERC20 usdc_optimism = IERC20(0x7F5c764cBc14f9669B88837ca1490cCa17c31607);
    ILayerZeroEndpointExtended lzEndpoint_optimism =
        ILayerZeroEndpointExtended(0x3c2269811836af69497E5F486A85D7316753cf62);
    IStargateRouterExtended sgRouter_optimism = IStargateRouterExtended(0xB0D502E938ed5f4df2E681fE6E419ff29631d62b);
    MasterOracleMock masterOracle_optimism;
    SwapperMock swapper_optimism;
    PoolRegistry poolRegistry_optimism;
    FeeProvider feeProvider_optimism;
    Pool pool_optimism;
    Treasury treasury_optimism;
    SyntheticToken msUSD_optimism;
    DebtToken msUSDDebt_optimism;
    DepositToken msdUSDC_optimism;
    DepositToken msdVaUSDC_optimism;
    ProxyOFT proxyOFT_msUSD_optimism;

    // Mainnet
    IERC20 usdc_mainnet = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    ILayerZeroEndpointExtended lzEndpoint_mainnet =
        ILayerZeroEndpointExtended(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675);
    IStargateRouterExtended sgRouter_mainnet = IStargateRouterExtended(0x8731d54E9D02c286767d56ac03e8037C07e01e98);
    MasterOracleMock masterOracle_mainnet;
    SwapperMock swapper_mainnet;
    PoolRegistry poolRegistry_mainnet;
    FeeProvider feeProvider_mainnet;
    Pool pool_mainnet;
    SyntheticToken msUSD_mainnet;
    DebtToken msUSDDebt_mainnet;
    DepositToken msdUSDC_mainnet;
    ProxyOFT proxyOFT_msUSD_mainnet;

    function setUp() public {
        // TODO: Get from .env
        // mainnetFork = vm.createSelectFork("https://eth.connect.bloq.cloud/v1/peace-blood-actress");
        mainnetFork = vm.createSelectFork("https://eth-mainnet.alchemyapi.io/v2/NbZ2px662CNSwdw3ZxdaZNe31yZbyddK");
        vm.rollFork(mainnetFork, 17380864);
        optimismFork = vm.createSelectFork("https://optimism-mainnet.infura.io/v3/9989c2cf77a24bddaa43103463cb8047");
        vm.rollFork(optimismFork, 103358871);

        //
        // Layer 2
        //
        vm.selectFork(optimismFork);

        masterOracle_optimism = new MasterOracleMock();
        swapper_optimism = new SwapperMock(masterOracle_optimism);
        poolRegistry_optimism = new PoolRegistry();
        feeProvider_optimism = new FeeProvider();
        treasury_optimism = new Treasury();
        pool_optimism = new Pool();
        msUSD_optimism = new SyntheticToken();
        msUSDDebt_optimism = new DebtToken();
        msdUSDC_optimism = new DepositToken();
        msdVaUSDC_optimism = new DepositToken();
        proxyOFT_msUSD_optimism = new ProxyOFT(address(lzEndpoint_optimism), msUSD_optimism, LZ_OP_CHAIN_ID);
        poolRegistry_optimism.initialize({masterOracle_: masterOracle_optimism, feeCollector_: feeCollector});
        feeProvider_optimism.initialize({poolRegistry_: poolRegistry_optimism, esMET_: IESMET(address(0))});
        pool_optimism.initialize(poolRegistry_optimism);
        treasury_optimism.initialize(pool_optimism);

        msdUSDC_optimism.initialize({
            underlying_: usdc_optimism,
            pool_: pool_optimism,
            name_: "msdUSDC",
            symbol_: "msdUSDC",
            decimals_: 6,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaUSDC_optimism.initialize({
            underlying_: vaUSDC_optimism,
            pool_: pool_optimism,
            name_: "msdVaUSDC",
            symbol_: "msdVaUSDC",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msUSD_optimism.initialize({
            name_: "msUSD",
            symbol_: "msUSD",
            decimals_: 18,
            poolRegistry_: pool_optimism.poolRegistry()
        });
        msUSDDebt_optimism.initialize({
            name_: "msUSD-Debt",
            symbol_: "msUSD-Debt",
            pool_: pool_optimism,
            syntheticToken_: msUSD_optimism,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        poolRegistry_optimism.registerPool(address(pool_optimism));
        pool_optimism.updateFeeProvider(feeProvider_optimism);
        pool_optimism.updateTreasury(treasury_optimism);
        pool_optimism.updateSwapper(swapper_optimism);
        pool_optimism.addDepositToken(address(msdUSDC_optimism));
        pool_optimism.addDepositToken(address(msdVaUSDC_optimism));
        pool_optimism.addDebtToken(msUSDDebt_optimism);
        masterOracle_optimism.updatePrice(address(usdc_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(vaUSDC_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(msUSD_optimism), 1e18);
        proxyOFT_msUSD_optimism.updateSwapper(swapper_optimism);
        proxyOFT_msUSD_optimism.updateStargateRouter(IStargateRouter(sgRouter_optimism));
        proxyOFT_msUSD_optimism.setUseCustomAdapterParams(true);
        msUSD_optimism.updateProxyOFT(proxyOFT_msUSD_optimism);
        msUSD_optimism.updateMaxBridgingBalance(type(uint256).max);
        swapper_optimism.updateRate(1e18);

        //
        // Mainnet
        //
        vm.selectFork(mainnetFork);

        masterOracle_mainnet = new MasterOracleMock();
        swapper_mainnet = new SwapperMock(masterOracle_mainnet);
        poolRegistry_mainnet = new PoolRegistry();
        feeProvider_mainnet = new FeeProvider();
        pool_mainnet = new Pool();
        msUSD_mainnet = new SyntheticToken();
        msUSDDebt_mainnet = new DebtToken();
        msdUSDC_mainnet = new DepositToken();
        proxyOFT_msUSD_mainnet = new ProxyOFT(address(lzEndpoint_mainnet), msUSD_mainnet, LZ_MAINNET_CHAIN_ID);
        poolRegistry_mainnet.initialize({masterOracle_: masterOracle_mainnet, feeCollector_: feeCollector});
        feeProvider_mainnet.initialize({poolRegistry_: poolRegistry_mainnet, esMET_: IESMET(address(0))});
        pool_mainnet.initialize(poolRegistry_mainnet);

        msdUSDC_mainnet.initialize({
            underlying_: usdc_mainnet,
            pool_: pool_mainnet,
            name_: "msdUSDC",
            symbol_: "msdUSDC",
            decimals_: 6,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msUSD_mainnet.initialize({
            name_: "msUSD",
            symbol_: "msUSD",
            decimals_: 18,
            poolRegistry_: pool_mainnet.poolRegistry()
        });
        msUSDDebt_mainnet.initialize({
            name_: "msUSD-Debt",
            symbol_: "msUSD-Debt",
            pool_: pool_mainnet,
            syntheticToken_: msUSD_mainnet,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        poolRegistry_mainnet.registerPool(address(pool_mainnet));
        pool_mainnet.updateFeeProvider(feeProvider_mainnet);
        pool_mainnet.updateSwapper(swapper_mainnet);
        pool_mainnet.addDepositToken(address(msdUSDC_mainnet));
        pool_mainnet.addDebtToken(msUSDDebt_mainnet);
        masterOracle_mainnet.updatePrice(address(usdc_mainnet), 1e18);
        masterOracle_mainnet.updatePrice(address(msUSD_mainnet), 1e18);
        proxyOFT_msUSD_mainnet.updateSwapper(swapper_mainnet);
        proxyOFT_msUSD_mainnet.updateStargateRouter(sgRouter_mainnet);
        proxyOFT_msUSD_mainnet.setUseCustomAdapterParams(true);
        msUSD_mainnet.updateProxyOFT(proxyOFT_msUSD_mainnet);
        msUSD_mainnet.updateMaxBridgingBalance(type(uint256).max);
        swapper_mainnet.updateRate(1e18);

        // Setup
        vm.selectFork(optimismFork);

        proxyOFT_msUSD_optimism.setTrustedRemote(
            LZ_MAINNET_CHAIN_ID,
            abi.encodePacked(proxyOFT_msUSD_mainnet, proxyOFT_msUSD_optimism)
        );

        proxyOFT_msUSD_optimism.updateProxyOftOf(LZ_MAINNET_CHAIN_ID, address(proxyOFT_msUSD_mainnet));
        proxyOFT_msUSD_optimism.updateCounterTokenOf(
            address(msUSD_optimism),
            LZ_MAINNET_CHAIN_ID,
            address(msUSD_mainnet)
        );
        proxyOFT_msUSD_optimism.updateCounterTokenOf(
            address(usdc_optimism),
            LZ_MAINNET_CHAIN_ID,
            address(usdc_mainnet)
        );
        deal(address(usdc_optimism), address(swapper_optimism), 1000000000000000e6);
        deal(address(vaUSDC_optimism), address(swapper_optimism), 1000000000000000e18);

        vm.selectFork(mainnetFork);

        proxyOFT_msUSD_mainnet.setTrustedRemote(LZ_OP_CHAIN_ID, abi.encode(proxyOFT_msUSD_optimism));
        proxyOFT_msUSD_mainnet.updateProxyOftOf(LZ_OP_CHAIN_ID, address(proxyOFT_msUSD_optimism));

        proxyOFT_msUSD_mainnet.updateCounterTokenOf(address(msUSD_mainnet), LZ_OP_CHAIN_ID, address(msUSD_optimism));
        proxyOFT_msUSD_mainnet.updateCounterTokenOf(address(usdc_mainnet), LZ_OP_CHAIN_ID, address(usdc_optimism));

        proxyOFT_msUSD_mainnet.updatePoolIdOf(address(usdc_mainnet), LZ_MAINNET_CHAIN_ID, SG_MAINNET_USDC_POOL_ID);
        proxyOFT_msUSD_mainnet.updatePoolIdOf(address(usdc_optimism), LZ_OP_CHAIN_ID, SG_OP_USDC_POOL_ID);

        deal(address(usdc_mainnet), address(swapper_mainnet), 1000000000e6);
    }

    function _getTx1Events()
        private
        returns (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams)
    {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("SendToChain(uint16,address,bytes,uint256)")) {
                SendToChain = entry;
            } else if (entry.topics[0] == keccak256("Packet(bytes)")) {
                Packet = entry;
            } else if (entry.topics[0] == keccak256("RelayerParams(bytes,uint16)")) {
                RelayerParams = entry;
            }
        }
    }

    function _tx1_layer2Leverage(
        uint256 amountIn_,
        uint256 layer1SwapAmountOutMin_,
        uint256 leverage_,
        uint256 depositAmountMin_
    ) private {
        vm.recordLogs();

        vm.selectFork(mainnetFork);

        uint256 _callbackTxNativeFee = proxyOFT_msUSD_mainnet.quoteCallbackTxNativeFee(
            address(pool_optimism),
            LZ_OP_CHAIN_ID
        );

        vm.selectFork(optimismFork);

        uint256 swapAndCallbackTxNativeFee = pool_optimism.quoteLayer2LeverageNativeFee({
            depositToken_: msdUSDC_optimism,
            syntheticToken_: msUSD_optimism,
            amountIn_: amountIn_,
            layer1SwapAmountOutMin_: layer1SwapAmountOutMin_,
            callbackTxNativeFee_: _callbackTxNativeFee
        });

        uint256 fee = swapAndCallbackTxNativeFee;
        deal(alice, fee);
        deal(address(usdc_optimism), alice, amountIn_);

        vm.startPrank(alice);
        usdc_optimism.approve(address(pool_optimism), type(uint256).max);
        pool_optimism.layer2Leverage{value: fee}({
            tokenIn_: usdc_optimism,
            depositToken_: msdVaUSDC_optimism,
            syntheticToken_: msUSD_optimism,
            amountIn_: amountIn_,
            leverage_: leverage_,
            depositAmountMin_: depositAmountMin_,
            layer1SwapAmountOutMin_: layer1SwapAmountOutMin_,
            callbackTxNativeFee_: _callbackTxNativeFee
        });
        vm.stopPrank();

        assertEq(alice.balance, 0, "fee-estimation-is-not-accurate");
    }

    function _getTx2Events()
        private
        returns (
            Vm.Log memory Swap,
            Vm.Log memory Packet,
            Vm.Log memory MessageFailed,
            Vm.Log memory CallOFTReceivedFailure
        )
    {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("Swap(uint16,uint256,address,uint256,uint256,uint256,uint256,uint256)")) {
                Swap = entry;
            } else if (entry.topics[0] == keccak256("Packet(bytes)")) {
                Packet = entry;
            } else if (entry.topics[0] == keccak256("MessageFailed(uint16,bytes,uint64,bytes,bytes)")) {
                // Note: This event will be thrown if the bridging transfer fails
                // event MessageFailed(uint16 _srcChainId, bytes _srcAddress, uint64 _nonce, bytes _payload, bytes _reason);
                MessageFailed = entry;
            } else if (
                entry.topics[0] ==
                keccak256("CallOFTReceivedFailure(uint16,bytes,uint64,bytes,address,uint256,bytes,bytes)")
            ) {
                // Note: This event will be thrown if the `onOFTReceived` call fails
                // event CallOFTReceivedFailure(uint16 indexed _srcChainId, bytes _srcAddress, uint64 _nonce, bytes _from, address indexed _to, uint _amount, bytes _payload, bytes _reason);
                CallOFTReceivedFailure = entry;
            }
        }
    }

    function _tx2_layer1Swap(
        Vm.Log memory SendToChainTx1,
        Vm.Log memory PacketTx1,
        Vm.Log memory RelayerParamsTx1
    ) private {
        vm.selectFork(mainnetFork);

        // Airdrop ETH
        // Note: Adapter params uses (uint16 version, uint256 gasAmount, uint256 nativeForDst, address addressOnDst)
        // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
        (bytes memory adapterParams, ) = abi.decode(RelayerParamsTx1.data, (bytes, uint16));
        uint256 nativeForDst = adapterParams.toUint256(34);
        assertEq(address(proxyOFT_msUSD_mainnet).balance, 0);
        deal(address(proxyOFT_msUSD_mainnet), nativeForDst);

        (bytes memory toAddress, ) = abi.decode(SendToChainTx1.data, (bytes, uint256));
        bytes memory from = abi.encodePacked(SendToChainTx1.topics[2]);
        assertEq(abi.decode(from, (address)), address(proxyOFT_msUSD_optimism));
        assertEq(toAddress.toAddress(0), address(proxyOFT_msUSD_mainnet));
        uint64 nonce = lzEndpoint_mainnet.getInboundNonce(LZ_OP_CHAIN_ID, from) + 1;

        // Note: Remove prefix added for `Packet` event
        // uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload
        // bytes memory encodedPayload = abi.encodePacked(nonce, localChainId, ua, dstChainId, dstAddress, payload);
        // emit Packet(encodedPayload);
        bytes memory encodedPayload = abi.decode(PacketTx1.data, (bytes));
        bytes memory payload = encodedPayload.slice(52, encodedPayload.length - 52);
        (, , , , , uint64 _dstGasForCall) = abi.decode(payload, (uint16, bytes, bytes, uint256, bytes, uint64));

        vm.prank(lzEndpoint_mainnet.defaultReceiveLibraryAddress());
        lzEndpoint_mainnet.receivePayload({
            _srcChainId: LZ_OP_CHAIN_ID,
            _srcAddress: from,
            _dstAddress: toAddress.toAddress(0),
            _nonce: nonce,
            _gasLimit: _dstGasForCall,
            _payload: payload
        });
    }

    function _getLayer2CallbackEvents() private returns (Vm.Log memory CachedSwapSaved, Vm.Log memory Revert) {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (
                entry.topics[0] ==
                keccak256("CachedSwapSaved(uint16,bytes,uint256,address,uint256,address,bytes,bytes)")
            ) {
                // Note: Emitted when `sgReceive()` fails
                // event CachedSwapSaved(uint16 chainId, bytes srcAddress, uint256 nonce, address token, uint256 amountLD, address to, bytes payload, bytes reason);
                CachedSwapSaved = entry;
            } else if (entry.topics[0] == keccak256("Revert(uint8,uint16,bytes,uint256)")) {
                // Note: Emitted when bridging fails
                // event Revert(uint8 bridgeFunctionType, uint16 chainId, bytes srcAddress, uint256 nonce);
                Revert = entry;
            }
        }
    }

    function _tx3_layer2Callback(Vm.Log memory SwapTx2, Vm.Log memory PacketTx2) private {
        vm.selectFork(optimismFork);

        address from;
        {
            (, , from, , , , , ) = abi.decode(
                SwapTx2.data,
                (uint16, uint256, address, uint256, uint256, uint256, uint256, uint256)
            );
        }

        uint256 srcPoolId;
        uint256 dstPoolId;
        uint256 dstGasForCall;
        StargatePool.SwapObj memory swapObj;
        bytes memory payload;
        {
            bytes memory encodedPayload = abi.decode(PacketTx2.data, (bytes));
            // Note: Remove prefix added for `Packet` event
            // uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload
            // bytes memory encodedPayload = abi.encodePacked(nonce, localChainId, ua, dstChainId, dstAddress, payload);
            // emit Packet(encodedPayload);
            bytes memory payloadWithStargateArgs = encodedPayload.slice(52, encodedPayload.length - 52);

            // Note: Stargate adds additional data to the payload, we have to extract ours from it
            (, srcPoolId, dstPoolId, dstGasForCall, , swapObj, , payload) = abi.decode(
                payloadWithStargateArgs,
                (uint8, uint256, uint256, uint256, StargatePool.CreditObj, StargatePool.SwapObj, bytes, bytes)
            );
        }

        uint64 nonce = lzEndpoint_optimism.getInboundNonce(LZ_MAINNET_CHAIN_ID, abi.encode(from)) + 1;

        vm.prank(sgRouter_optimism.bridge());
        sgRouter_optimism.swapRemote({
            _srcChainId: LZ_MAINNET_CHAIN_ID,
            _srcAddress: abi.encode(from),
            _nonce: nonce,
            _srcPoolId: srcPoolId,
            _dstPoolId: dstPoolId,
            _dstGasForCall: dstGasForCall,
            _to: address(proxyOFT_msUSD_optimism),
            _s: swapObj,
            _payload: payload
        });
    }

    function test_layer2Leverage() external {
        //
        // given
        //
        vm.selectFork(optimismFork);
        (, uint256 _depositInUsdBefore, uint256 _debtInUsdBefore, , ) = pool_optimism.debtPositionOf(alice);
        assertEq(_depositInUsdBefore, 0);
        assertEq(_debtInUsdBefore, 0);

        //
        // when
        //
        _tx1_layer2Leverage({
            amountIn_: 1000e6,
            layer1SwapAmountOutMin_: 0,
            leverage_: 1.5e18,
            depositAmountMin_: 1450e18
        });
        (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getTx1Events();

        _tx2_layer1Swap(SendToChain, Packet, RelayerParams);
        (Vm.Log memory Swap, Vm.Log memory Packet_Tx2, , ) = _getTx2Events();

        assertEq(address(proxyOFT_msUSD_mainnet).balance, 0, "fee-estimation-is-not-accurate");

        _tx3_layer2Callback(Swap, Packet_Tx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertEq(_debtInUsdAfter, 500e18);
    }

    function test_failedTx2_whenSynthTransferReverted() external {
        //
        // given
        //
        vm.selectFork(mainnetFork);
        msUSD_mainnet.updateMaxBridgingBalance(100e18); // It will make mainnet's bridge minting to fail

        //
        // when
        //
        _tx1_layer2Leverage({
            amountIn_: 1000e6,
            layer1SwapAmountOutMin_: 0,
            leverage_: 1.5e18,
            depositAmountMin_: 1450e18
        });
        (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getTx1Events();

        // Failed tx
        _tx2_layer1Swap(SendToChain, Packet, RelayerParams);
        (, , Vm.Log memory MessageFailed, ) = _getTx2Events();
        (uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload, bytes memory reason) = abi
            .decode(MessageFailed.data, (uint16, bytes, uint64, bytes, bytes));
        assertEq(reason, abi.encodeWithSignature("SurpassMaxBridgingBalance()"));

        // Same state, retry will fail too
        vm.expectRevert();
        proxyOFT_msUSD_mainnet.retryMessage(_srcChainId, _srcAddress, _nonce, _payload);

        // Retry will work after amending state
        msUSD_mainnet.updateMaxBridgingBalance(type(uint256).max);
        proxyOFT_msUSD_mainnet.retryMessage(_srcChainId, _srcAddress, _nonce, _payload);
        (Vm.Log memory Swap, Vm.Log memory PacketEventTx2, , ) = _getTx2Events();

        _tx3_layer2Callback(Swap, PacketEventTx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertEq(_debtInUsdAfter, 500e18);
    }

    function test_failedTx2_whenOnOFTReceivedReverted() external {
        //
        // when
        //
        _tx1_layer2Leverage({
            amountIn_: 1000e6,
            layer1SwapAmountOutMin_: 501e6, // Wrong slippage
            leverage_: 1.5e18,
            depositAmountMin_: 1450e18
        });
        (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getTx1Events();

        // Failed tx
        _tx2_layer1Swap(SendToChain, Packet, RelayerParams);
        (, , , Vm.Log memory CallOFTReceivedFailure) = _getTx2Events();
        (
            bytes memory srcAddress,
            uint64 nonce,
            bytes memory from,
            uint amount,
            bytes memory payload,
            bytes memory reason
        ) = abi.decode(CallOFTReceivedFailure.data, (bytes, uint64, bytes, uint, bytes, bytes));
        uint16 srcChainId = uint16(uint256(CallOFTReceivedFailure.topics[1])); // uint16 indexed srcChainId
        address to = address(uint160(uint256(CallOFTReceivedFailure.topics[2]))); // address indexed to
        assertEq(reason.slice(4, reason.length - 4), abi.encode("swapper-mock-slippage"));

        // Same state, retry will fail too
        vm.expectRevert();
        proxyOFT_msUSD_mainnet.retryOFTReceived(srcChainId, srcAddress, nonce, from, to, amount, payload);

        // Retry will work with right slippage
        proxyOFT_msUSD_mainnet.retryOFTReceived(
            srcChainId,
            srcAddress,
            nonce,
            from,
            to,
            amount,
            payload,
            500e6 // Correct slippage
        );
        (Vm.Log memory SwapTx2, Vm.Log memory PacketTx2, , ) = _getTx2Events();

        _tx3_layer2Callback(SwapTx2, PacketTx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertEq(_debtInUsdAfter, 500e18);
    }

    function test_failedTx3_whenCollateralTransferReverted() external {
        //
        // given
        //

        // Making amount to bridge from mainnet to L2 be higher than the SG Pool liquidity
        vm.selectFork(optimismFork);
        uint256 sgUsdcLiquidity = usdc_optimism.balanceOf(SG_OP_USDC_POOL);
        uint256 amountIn = sgUsdcLiquidity * 3;

        // Adding enough liquidity to mainnet SG Pool
        vm.selectFork(mainnetFork);
        address whale = address(123);
        deal(address(usdc_mainnet), whale, amountIn);
        vm.startPrank(whale);
        usdc_mainnet.approve(address(sgRouter_mainnet), type(uint256).max);
        sgRouter_mainnet.addLiquidity(SG_MAINNET_USDC_POOL_ID, amountIn, whale);
        vm.stopPrank();
        vm.prank(address(sgRouter_mainnet));
        StargatePool(SG_MAINNET_POLL).creditChainPath(
            LZ_OP_CHAIN_ID,
            SG_OP_USDC_POOL_ID,
            StargatePool.CreditObj({credits: 1000000000e6, idealBalance: 1000000000e6})
        );

        //
        // when
        //
        _tx1_layer2Leverage({amountIn_: amountIn, layer1SwapAmountOutMin_: 0, leverage_: 1.5e18, depositAmountMin_: 0});
        (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getTx1Events();

        _tx2_layer1Swap(SendToChain, Packet, RelayerParams);
        (Vm.Log memory Swap, Vm.Log memory PacketTx2, , ) = _getTx2Events();

        // Failed tx
        _tx3_layer2Callback(Swap, PacketTx2);
        (, Vm.Log memory Revert) = _getLayer2CallbackEvents();
        assertGt(Revert.data.length, 0); // Emitted `Revert` event
        (, uint16 chainId, bytes memory srcAddress, uint256 nonce) = abi.decode(
            Revert.data,
            (uint8, uint16, bytes, uint256)
        );

        // Same state, retry will fail too
        sgRouter_optimism.retryRevert(chainId, srcAddress, nonce);
        (, Revert) = _getLayer2CallbackEvents();
        assertGt(Revert.data.length, 0); // Emitted `Revert` event

        // Retry will work after adding liquidity to the SG Pool
        vm.selectFork(optimismFork);
        deal(address(usdc_optimism), whale, amountIn);
        vm.startPrank(whale);
        usdc_optimism.approve(address(sgRouter_optimism), type(uint256).max);
        sgRouter_optimism.addLiquidity(SG_OP_USDC_POOL_ID, amountIn, whale);
        vm.stopPrank();
        // Note: Increase chainPath[chainPathIndex].lkb to avoid underflow
        stdstore
            .target(SG_OP_USDC_POOL)
            .sig("chainPaths(uint256)")
            .with_key(StargatePool(SG_OP_USDC_POOL).chainPathIndexLookup(LZ_MAINNET_CHAIN_ID, SG_MAINNET_USDC_POOL_ID))
            .depth(5)
            .checked_write(100000000000e6);

        sgRouter_optimism.retryRevert(chainId, srcAddress, nonce);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertGt(_depositInUsdAfter, 0);
        assertGt(_debtInUsdAfter, 0);
    }

    function test_failedTx3_whenSgReceiveReverted() external {
        //
        // given
        //
        vm.selectFork(optimismFork);
        assertEq(usdc_optimism.balanceOf(address(proxyOFT_msUSD_optimism)), 0);

        uint256 wrongDepositAmountMin = 9999e18;
        uint256 correctDepositAmountMin = 1450e18;

        //
        // when
        //
        _tx1_layer2Leverage({
            amountIn_: 1000e6,
            layer1SwapAmountOutMin_: 500e6,
            leverage_: 1.5e18,
            depositAmountMin_: wrongDepositAmountMin
        });
        (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams) = _getTx1Events();

        _tx2_layer1Swap(SendToChain, Packet, RelayerParams);
        (Vm.Log memory Swap, Vm.Log memory PacketTx2, , ) = _getTx2Events();

        // Failed tx
        _tx3_layer2Callback(Swap, PacketTx2);
        (Vm.Log memory CachedSwapSaved, ) = _getLayer2CallbackEvents();
        (uint16 chainId, bytes memory srcAddress, uint256 nonce, , , , bytes memory payload, bytes memory reason) = abi
            .decode(CachedSwapSaved.data, (uint16, bytes, uint256, address, uint256, address, bytes, bytes));
        assertEq(reason, abi.encodeWithSignature("LeverageSlippageTooHigh()"));
        // Note: Even if `sgReceive` fails, the collateral amount is sent
        assertGt(usdc_optimism.balanceOf(address(proxyOFT_msUSD_optimism)), 0);

        // Same state, retry will fail too
        vm.expectRevert();
        sgRouter_optimism.clearCachedSwap(chainId, srcAddress, nonce);

        // Retry will work with right slippage
        (, uint256 _layer2LeverageId) = abi.decode(payload, (address, uint256));
        vm.prank(alice);
        pool_optimism.retryLayer2LeverageCallback(
            _layer2LeverageId,
            correctDepositAmountMin,
            chainId,
            srcAddress,
            nonce
        );

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertEq(_debtInUsdAfter, 500e18);
    }
}
