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
import {SwapperMock} from "../../contracts/mock/SwapperMock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";
import {WadRayMath} from "../../contracts/lib/WadRayMath.sol";

interface ILayerZeroEndpointExtended is ILayerZeroEndpoint {
    function defaultReceiveLibraryAddress() external view returns (address);
}

interface IStargateRouterExtender is IStargateRouter {
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
}

contract CrossChains_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;
    uint16 public constant LZ_OP_CHAIN_ID = 111;

    uint256 public constant SG_MAINNET_DAI_POOL_ID = 3;
    uint256 public constant SG_OP_DAI_POOL_ID = 3;

    address feeCollector = address(999);
    address alice = address(10);
    address bob = address(20);

    uint256 mainnetFork;
    uint256 optimismFork;

    // Layer 2
    IERC20 dai_optimism = IERC20(0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1);
    ILayerZeroEndpointExtended lzEndpoint_optimism =
        ILayerZeroEndpointExtended(0x3c2269811836af69497E5F486A85D7316753cf62);
    IStargateRouterExtender sgRouter_optimism = IStargateRouterExtender(0xB0D502E938ed5f4df2E681fE6E419ff29631d62b);
    MasterOracleMock masterOracle_optimism;
    SwapperMock swapper_optimism;
    PoolRegistry poolRegistry_optimism;
    FeeProvider feeProvider_optimism;
    Pool pool_optimism;
    Treasury treasury_optimism;
    SyntheticToken msUSD_optimism;
    DebtToken msUSDDebt_optimism;
    DepositToken msdDAI_optimism;
    ProxyOFT proxyOFT_msUSD_optimism;

    // Mainnet
    IERC20 dai_mainnet = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    ILayerZeroEndpointExtended lzEndpoint_mainnet =
        ILayerZeroEndpointExtended(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675);
    IStargateRouterExtender sgRouter_mainnet = IStargateRouterExtender(0x8731d54E9D02c286767d56ac03e8037C07e01e98);
    MasterOracleMock masterOracle_mainnet;
    SwapperMock swapper_mainnet;
    PoolRegistry poolRegistry_mainnet;
    FeeProvider feeProvider_mainnet;
    Pool pool_mainnet;
    SyntheticToken msUSD_mainnet;
    DebtToken msUSDDebt_mainnet;
    DepositToken msdDAI_mainnet;
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
        msdDAI_optimism = new DepositToken();
        proxyOFT_msUSD_optimism = new ProxyOFT(address(lzEndpoint_optimism), msUSD_optimism, LZ_OP_CHAIN_ID);
        poolRegistry_optimism.initialize({masterOracle_: masterOracle_optimism, feeCollector_: feeCollector});
        feeProvider_optimism.initialize({poolRegistry_: poolRegistry_optimism, esMET_: IESMET(address(0))});
        pool_optimism.initialize(poolRegistry_optimism);
        treasury_optimism.initialize(pool_optimism);

        msdDAI_optimism.initialize({
            underlying_: dai_optimism,
            pool_: pool_optimism,
            name_: "msdDAI",
            symbol_: "msdDAI",
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
            name_: "msDAI-Debt",
            symbol_: "msDAI-Debt",
            pool_: pool_optimism,
            syntheticToken_: msUSD_optimism,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        poolRegistry_optimism.registerPool(address(pool_optimism));
        pool_optimism.updateFeeProvider(feeProvider_optimism);
        pool_optimism.updateTreasury(treasury_optimism);
        pool_optimism.addDepositToken(address(msdDAI_optimism));
        pool_optimism.addDebtToken(msUSDDebt_optimism);
        masterOracle_optimism.updatePrice(address(dai_optimism), 1e18);
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
        msdDAI_mainnet = new DepositToken();
        proxyOFT_msUSD_mainnet = new ProxyOFT(address(lzEndpoint_mainnet), msUSD_mainnet, LZ_MAINNET_CHAIN_ID);
        poolRegistry_mainnet.initialize({masterOracle_: masterOracle_mainnet, feeCollector_: feeCollector});
        feeProvider_mainnet.initialize({poolRegistry_: poolRegistry_mainnet, esMET_: IESMET(address(0))});
        pool_mainnet.initialize(poolRegistry_mainnet);

        msdDAI_mainnet.initialize({
            underlying_: dai_mainnet,
            pool_: pool_mainnet,
            name_: "msdDAI",
            symbol_: "msdDAI",
            decimals_: 18,
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
            name_: "msDAI-Debt",
            symbol_: "msDAI-Debt",
            pool_: pool_mainnet,
            syntheticToken_: msUSD_mainnet,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        poolRegistry_mainnet.registerPool(address(pool_mainnet));
        pool_mainnet.updateFeeProvider(feeProvider_mainnet);
        pool_mainnet.addDepositToken(address(msdDAI_mainnet));
        pool_mainnet.addDebtToken(msUSDDebt_mainnet);
        masterOracle_mainnet.updatePrice(address(dai_mainnet), 1e18);
        masterOracle_mainnet.updatePrice(address(dai_optimism), 1e18);
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
        proxyOFT_msUSD_optimism.updateCounterTokenOf(address(dai_optimism), LZ_MAINNET_CHAIN_ID, address(dai_mainnet));
        deal(address(dai_optimism), address(swapper_mainnet), 1000000e18);

        vm.selectFork(mainnetFork);

        proxyOFT_msUSD_mainnet.setTrustedRemote(LZ_OP_CHAIN_ID, abi.encode(proxyOFT_msUSD_optimism));
        proxyOFT_msUSD_mainnet.updateProxyOftOf(LZ_OP_CHAIN_ID, address(proxyOFT_msUSD_optimism));

        proxyOFT_msUSD_mainnet.updateCounterTokenOf(address(msUSD_mainnet), LZ_OP_CHAIN_ID, address(msUSD_optimism));
        proxyOFT_msUSD_mainnet.updateCounterTokenOf(address(dai_mainnet), LZ_OP_CHAIN_ID, address(dai_optimism));

        proxyOFT_msUSD_mainnet.updatePoolIdOf(address(dai_mainnet), LZ_MAINNET_CHAIN_ID, SG_MAINNET_DAI_POOL_ID);
        proxyOFT_msUSD_mainnet.updatePoolIdOf(address(dai_optimism), LZ_OP_CHAIN_ID, SG_OP_DAI_POOL_ID);

        deal(address(dai_mainnet), address(swapper_mainnet), 1000000e18);
    }

    function _layer2Leverage()
        private
        returns (Vm.Log memory sendToChainEventTx1, Vm.Log memory packetEventTx1, Vm.Log memory relayerParamsEventTx1)
    {
        vm.selectFork(optimismFork);

        uint256 amountIn = 1000e18;
        uint256 depositAmountMin = 1450e18;

        uint256 swapAndCallbackTxNativeFee = pool_optimism.quoteLayer2LeverageNativeFee({
            depositToken_: msdDAI_optimism,
            syntheticToken_: msUSD_optimism,
            amountIn_: amountIn,
            depositAmountMin_: depositAmountMin
        });

        vm.startPrank(alice);

        uint256 toRefund = 1e18;
        uint256 fee = swapAndCallbackTxNativeFee + toRefund;
        deal(alice, fee);

        dai_optimism.approve(address(pool_optimism), type(uint256).max);
        pool_optimism.layer2Leverage{value: fee}({
            tokenIn_: dai_optimism,
            depositToken_: msdDAI_optimism,
            syntheticToken_: msUSD_optimism,
            amountIn_: amountIn,
            leverage_: 1.5e18,
            depositAmountMin_: depositAmountMin
        });

        assertEq(alice.balance, toRefund, "fee-estimation-is-not-accurate");

        vm.stopPrank();

        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("SendToChain(uint16,address,bytes,uint256)")) {
                sendToChainEventTx1 = entry;
            } else if (entry.topics[0] == keccak256("Packet(bytes)")) {
                packetEventTx1 = entry;
            } else if (entry.topics[0] == keccak256("RelayerParams(bytes,uint16)")) {
                relayerParamsEventTx1 = entry;
            }
        }
    }

    function _layer1Swap(
        Vm.Log memory sendToChainEventTx1,
        Vm.Log memory packetEventTx1,
        Vm.Log memory relayerParamsEventTx1
    ) private returns (Vm.Log memory swapEventTx2, Vm.Log memory packetEventTx2) {
        vm.selectFork(mainnetFork);

        // Airdrop ETH
        // Note: Adapter params uses (uint16 version, uint256 gasAmount, uint256 nativeForDst, address addressOnDst)
        // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
        (bytes memory adapterParams, ) = abi.decode(relayerParamsEventTx1.data, (bytes, uint16));
        uint256 nativeForDst = adapterParams.toUint256(34);
        assertEq(address(proxyOFT_msUSD_mainnet).balance, 0);
        deal(address(proxyOFT_msUSD_mainnet), nativeForDst);

        (bytes memory toAddress, ) = abi.decode(sendToChainEventTx1.data, (bytes, uint256));
        bytes memory from = abi.encodePacked(sendToChainEventTx1.topics[2]);
        assertEq(abi.decode(from, (address)), address(proxyOFT_msUSD_optimism));
        assertEq(toAddress.toAddress(0), address(proxyOFT_msUSD_mainnet));
        uint64 nonce = lzEndpoint_mainnet.getInboundNonce(LZ_OP_CHAIN_ID, from) + 1;

        // Note: Remove prefix added for `Packet` event
        // uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload
        // bytes memory encodedPayload = abi.encodePacked(nonce, localChainId, ua, dstChainId, dstAddress, payload);
        // emit Packet(encodedPayload);
        bytes memory encodedPayload = abi.decode(packetEventTx1.data, (bytes));
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
        assertEq(address(proxyOFT_msUSD_mainnet).balance, 0, "fee-estimation-is-not-accurate");

        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("Swap(uint16,uint256,address,uint256,uint256,uint256,uint256,uint256)")) {
                swapEventTx2 = entry;
            } else if (entry.topics[0] == keccak256("Packet(bytes)")) {
                packetEventTx2 = entry;
            }
        }
    }

    function _layer2Callback(Vm.Log memory swapEventTx2, Vm.Log memory packetEventTx2) private {
        vm.selectFork(optimismFork);

        address from;
        {
            (, , from, , , , , ) = abi.decode(
                swapEventTx2.data,
                (uint16, uint256, address, uint256, uint256, uint256, uint256, uint256)
            );
        }

        uint256 srcPoolId;
        uint256 dstPoolId;
        uint256 dstGasForCall;
        StargatePool.SwapObj memory swapObj;
        bytes memory payload;
        {
            bytes memory encodedPayload = abi.decode(packetEventTx2.data, (bytes));
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
        vm.recordLogs();

        //
        // given
        //
        vm.selectFork(optimismFork);
        deal(address(dai_optimism), alice, 1000000e18);
        (, uint256 _depositInUsdBefore, uint256 _debtInUsdBefore, , ) = pool_optimism.debtPositionOf(alice);
        assertEq(_depositInUsdBefore, 0);
        assertEq(_debtInUsdBefore, 0);

        //
        // when
        //
        // tx1
        (
            Vm.Log memory sendToChainEventTx1,
            Vm.Log memory packetEventTx1,
            Vm.Log memory relayerParamsEventTx1
        ) = _layer2Leverage();
        // tx2
        (Vm.Log memory swapEventTx2, Vm.Log memory packetEventTx2) = _layer1Swap(
            sendToChainEventTx1,
            packetEventTx1,
            relayerParamsEventTx1
        );
        // tx3
        _layer2Callback(swapEventTx2, packetEventTx2);

        //
        // then
        //
        (, uint256 _depositInUsdAfter, uint256 _debtInUsdAfter, , ) = pool_optimism.debtPositionOf(alice);
        assertApproxEqAbs(_depositInUsdAfter, 1500e18, 1e18);
        assertEq(_debtInUsdAfter, 500e18);
    }

    function test_TODO() external {
        // TODO: Write tests for the scenarios below
        // - swap (tx2) fails and work after retrying (e.g. after synth `maxBridgingBalance` amend)
        // - swap (tx2) fails and retry won't work (e.g. amountOutMin too way high)
        // - callback (tx3) fails and work after retrying (e.g. after synth `totalSupply` amend)
        // - callback (tx3) fails and retry won't work (e.g. position end up underwater)
    }
}
