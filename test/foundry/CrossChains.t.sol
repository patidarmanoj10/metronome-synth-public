// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {BytesLib} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {ILayerZeroReceiver} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroReceiver.sol";
import {ILayerZeroEndpoint} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroEndpoint.sol";
import {Pool as StargatePool} from "../../contracts/dependencies/stargate-protocol/Pool.sol";
import {IStargateRouter} from "../../contracts/dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
import {PoolRegistry} from "../../contracts/PoolRegistry.sol";
import {Pool, ISyntheticToken, IERC20} from "../../contracts/Pool.sol";
import {SmartFarmingManager} from "../../contracts/SmartFarmingManager.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {DepositToken} from "../../contracts/DepositToken.sol";
import {DebtToken} from "../../contracts/DebtToken.sol";
import {SyntheticToken} from "../../contracts/SyntheticToken.sol";
import {Layer1ProxyOFT, IProxyOFT} from "../../contracts/Layer1ProxyOFT.sol";
import {Layer2ProxyOFT} from "../../contracts/Layer2ProxyOFT.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {MasterOracleMock} from "../../contracts/mock/MasterOracleMock.sol";
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

abstract contract CrossChains_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;
    uint16 public constant LZ_OP_CHAIN_ID = 111;

    uint256 public constant SG_USDC_POOL_ID = 1;

    address public constant SG_OP_USDC_POOL = 0xDecC0c09c3B5f6e92EF4184125D5648a66E35298;
    address public constant SG_MAINNET_USDC_POOL = 0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56;

    address feeCollector = address(999);
    address alice = address(10);
    address whale = address(123);

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
    SmartFarmingManager smartFarmingManager_optimism;
    Treasury treasury_optimism;
    SyntheticToken msUSD_optimism;
    DebtToken msUSDDebt_optimism;
    DepositToken msdUSDC_optimism;
    DepositToken msdVaUSDC_optimism;
    Layer2ProxyOFT proxyOFT_msUSD_optimism;

    // Mainnet
    IERC20 usdc_mainnet = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    ILayerZeroEndpointExtended lzEndpoint_mainnet =
        ILayerZeroEndpointExtended(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675);
    IStargateRouterExtended sgRouter_mainnet = IStargateRouterExtended(0x8731d54E9D02c286767d56ac03e8037C07e01e98);
    MasterOracleMock masterOracle_mainnet;
    SwapperMock swapper_mainnet;
    Treasury treasury_mainnet;
    PoolRegistry poolRegistry_mainnet;
    FeeProvider feeProvider_mainnet;
    Pool pool_mainnet;
    SmartFarmingManager smartFarmingManager_mainnet;
    SyntheticToken msUSD_mainnet;
    DebtToken msUSDDebt_mainnet;
    DepositToken msdUSDC_mainnet;
    Layer1ProxyOFT proxyOFT_msUSD_mainnet;

    function setUp() public virtual {
        // TODO: Get from .env
        // Refs: https://github.com/autonomoussoftware/metronome-synth/issues/874
        // mainnetFork = vm.createSelectFork("https://eth.connect.bloq.cloud/v1/peace-blood-actress");
        mainnetFork = vm.createSelectFork("https://eth-mainnet.alchemyapi.io/v2/NbZ2px662CNSwdw3ZxdaZNe31yZbyddK");
        vm.rollFork(mainnetFork, 17635570);
        optimismFork = vm.createSelectFork("https://optimism-mainnet.infura.io/v3/9989c2cf77a24bddaa43103463cb8047");
        vm.rollFork(optimismFork, 106528550);

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
        smartFarmingManager_optimism = new SmartFarmingManager();
        msUSD_optimism = new SyntheticToken();
        msUSDDebt_optimism = new DebtToken();
        msdUSDC_optimism = new DepositToken();
        msdVaUSDC_optimism = new DepositToken();
        proxyOFT_msUSD_optimism = new Layer2ProxyOFT();
        proxyOFT_msUSD_optimism.initialize(address(lzEndpoint_optimism), msUSD_optimism);
        poolRegistry_optimism.initialize({masterOracle_: masterOracle_optimism, feeCollector_: feeCollector});
        feeProvider_optimism.initialize({poolRegistry_: poolRegistry_optimism, esMET_: IESMET(address(0))});
        pool_optimism.initialize(poolRegistry_optimism);
        smartFarmingManager_optimism.initialize(pool_optimism);
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
        poolRegistry_optimism.updateSwapper(swapper_optimism);
        pool_optimism.updateFeeProvider(feeProvider_optimism);
        pool_optimism.updateTreasury(treasury_optimism);
        pool_optimism.updateSmartFarmingManager(smartFarmingManager_optimism);
        pool_optimism.addDepositToken(address(msdUSDC_optimism));
        pool_optimism.addDepositToken(address(msdVaUSDC_optimism));
        pool_optimism.addDebtToken(msUSDDebt_optimism);
        masterOracle_optimism.updatePrice(address(usdc_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(vaUSDC_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(msUSD_optimism), 1e18);
        proxyOFT_msUSD_optimism.updateStargateRouter(IStargateRouter(sgRouter_optimism));
        proxyOFT_msUSD_optimism.setUseCustomAdapterParams(true);
        proxyOFT_msUSD_optimism.setMinDstGas(LZ_MAINNET_CHAIN_ID, proxyOFT_msUSD_optimism.PT_SEND(), 200_000);
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
        treasury_mainnet = new Treasury();
        pool_mainnet = new Pool();
        smartFarmingManager_mainnet = new SmartFarmingManager();
        msUSD_mainnet = new SyntheticToken();
        msUSDDebt_mainnet = new DebtToken();
        msdUSDC_mainnet = new DepositToken();
        proxyOFT_msUSD_mainnet = new Layer1ProxyOFT();
        proxyOFT_msUSD_mainnet.initialize(address(lzEndpoint_mainnet), msUSD_mainnet);
        poolRegistry_mainnet.initialize({masterOracle_: masterOracle_mainnet, feeCollector_: feeCollector});
        feeProvider_mainnet.initialize({poolRegistry_: poolRegistry_mainnet, esMET_: IESMET(address(0))});
        pool_mainnet.initialize(poolRegistry_mainnet);
        treasury_mainnet.initialize(pool_mainnet);
        smartFarmingManager_mainnet.initialize(pool_mainnet);

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
        poolRegistry_mainnet.updateSwapper(swapper_mainnet);
        pool_mainnet.updateFeeProvider(feeProvider_mainnet);
        pool_mainnet.updateSmartFarmingManager(smartFarmingManager_mainnet);
        pool_mainnet.addDepositToken(address(msdUSDC_mainnet));
        pool_mainnet.addDebtToken(msUSDDebt_mainnet);
        pool_mainnet.updateTreasury(treasury_mainnet);
        masterOracle_mainnet.updatePrice(address(usdc_mainnet), 1e18);
        masterOracle_mainnet.updatePrice(address(msUSD_mainnet), 1e18);
        proxyOFT_msUSD_mainnet.updateStargateRouter(sgRouter_mainnet);
        proxyOFT_msUSD_mainnet.setUseCustomAdapterParams(true);
        proxyOFT_msUSD_mainnet.setMinDstGas(LZ_OP_CHAIN_ID, proxyOFT_msUSD_mainnet.PT_SEND(), 200_000);
        msUSD_mainnet.updateProxyOFT(proxyOFT_msUSD_mainnet);
        msUSD_mainnet.updateMaxBridgingBalance(type(uint256).max);
        swapper_mainnet.updateRate(1e18);

        // Labels
        vm.label(alice, "Alice");
        vm.label(feeCollector, "FeeCollector");

        vm.label(address(sgRouter_optimism), "SgRouter OP");
        vm.label(address(lzEndpoint_optimism), "LzEndpoint OP");
        vm.label(address(msUSD_optimism), "msUSD OP");
        vm.label(address(usdc_optimism), "USDC OP");
        vm.label(address(vaUSDC_optimism), "vaUSDC OP");

        vm.label(address(sgRouter_mainnet), "SgRouter Mainnet");
        vm.label(address(lzEndpoint_mainnet), "LzEndpoint Mainnet");
        vm.label(address(msUSD_mainnet), "msUSD Mainnet");
        vm.label(address(usdc_mainnet), "USDC Mainnet");

        // Setup
        vm.selectFork(optimismFork);

        proxyOFT_msUSD_optimism.setTrustedRemote(
            LZ_MAINNET_CHAIN_ID,
            abi.encodePacked(address(proxyOFT_msUSD_mainnet), address(proxyOFT_msUSD_optimism))
        );

        proxyOFT_msUSD_optimism.updatePoolIdOf(address(usdc_optimism), SG_USDC_POOL_ID);

        deal(address(usdc_optimism), address(swapper_optimism), 1000000000000000e6);
        deal(address(vaUSDC_optimism), address(swapper_optimism), 1000000000000000e18);

        vm.selectFork(mainnetFork);

        proxyOFT_msUSD_mainnet.setTrustedRemote(
            LZ_OP_CHAIN_ID,
            abi.encodePacked(address(proxyOFT_msUSD_optimism), address(proxyOFT_msUSD_mainnet))
        );

        proxyOFT_msUSD_mainnet.updatePoolIdOf(address(usdc_mainnet), SG_USDC_POOL_ID);

        deal(address(usdc_mainnet), address(swapper_mainnet), 1000000000e6);
        deal(address(msUSD_mainnet), address(swapper_mainnet), 1000000000e18);
    }

    function _doNativeAirdropIfNeeded(Vm.Log memory RelayerParams) internal {
        if (RelayerParams.data.length != 192) return;

        // Airdrop ETH
        // Note: Adapter params uses (uint16 version, uint256 gasAmount, uint256 nativeForDst, address addressOnDst)
        // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
        (bytes memory adapterParams, ) = abi.decode(RelayerParams.data, (bytes, uint16));
        uint256 nativeForDst = adapterParams.toUint256(34);
        if (nativeForDst > 0) {
            address destination = adapterParams.toAddress(66);
            assertEq(destination.balance, 0);
            deal(destination, nativeForDst);
        }
    }

    function _executeSgSwapArrivalTx(Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams) internal {
        (
            uint16 srcChainId,
            address from,
            uint256 srcPoolId,
            uint256 dstPoolId,
            uint256 dstGasForCall,
            StargatePool.SwapObj memory swapObj,
            bytes memory payload
        ) = _decodeSgSwapEvents(Swap, Packet);

        uint256 fork;
        ILayerZeroEndpointExtended lz;
        IStargateRouterExtended sg;
        address to;

        if (srcChainId == LZ_OP_CHAIN_ID) {
            fork = mainnetFork;
            lz = lzEndpoint_mainnet;
            sg = sgRouter_mainnet;
            to = address(proxyOFT_msUSD_mainnet);
        } else {
            fork = optimismFork;
            lz = lzEndpoint_optimism;
            sg = sgRouter_optimism;
            to = address(proxyOFT_msUSD_optimism);
        }

        vm.selectFork(fork);

        _doNativeAirdropIfNeeded(RelayerParams);
        uint64 nonce = lz.getInboundNonce(srcChainId, abi.encode(from)) + 1;

        vm.prank(sg.bridge());
        sg.swapRemote({
            _srcChainId: srcChainId,
            _srcAddress: abi.encode(from),
            _nonce: nonce,
            _srcPoolId: srcPoolId,
            _dstPoolId: dstPoolId,
            _dstGasForCall: dstGasForCall,
            _to: to,
            _s: swapObj,
            _payload: payload
        });
    }

    function _executeOftTransferArrivalTx(
        Vm.Log memory SendToChain,
        Vm.Log memory Packet,
        Vm.Log memory RelayerParams
    ) internal {
        (uint16 _dstChainId, address from, address to) = _decodeSendToChainEvent(SendToChain);
        (uint64 _dstGasForCall, bytes memory payload) = _decodeOftPacketEvent(Packet);

        uint256 fork;
        uint16 _srcChainId;
        ILayerZeroEndpointExtended lz;

        if (_dstChainId == LZ_MAINNET_CHAIN_ID) {
            fork = mainnetFork;
            _srcChainId = LZ_OP_CHAIN_ID;
            lz = lzEndpoint_mainnet;
        } else {
            fork = optimismFork;
            _srcChainId = LZ_MAINNET_CHAIN_ID;
            lz = lzEndpoint_optimism;
        }

        vm.selectFork(fork);

        _doNativeAirdropIfNeeded(RelayerParams);

        uint64 nonce = lz.getInboundNonce(_srcChainId, abi.encode(from)) + 1;

        vm.prank(lz.defaultReceiveLibraryAddress());
        lz.receivePayload({
            _srcChainId: _srcChainId,
            _srcAddress: abi.encodePacked(from, to),
            _dstAddress: to,
            _nonce: nonce,
            _gasLimit: _dstGasForCall,
            _payload: payload
        });
    }

    function _addSgLiquidity(address sgPool, uint256 amountIn) internal {
        if (sgPool == SG_MAINNET_USDC_POOL) {
            deal(address(usdc_mainnet), whale, amountIn);
            vm.startPrank(whale);
            usdc_mainnet.approve(address(sgRouter_mainnet), type(uint256).max);
            sgRouter_mainnet.addLiquidity(SG_USDC_POOL_ID, amountIn, whale);
            vm.stopPrank();
            vm.prank(address(sgRouter_mainnet));
            StargatePool(sgPool).creditChainPath(
                LZ_OP_CHAIN_ID,
                SG_USDC_POOL_ID,
                StargatePool.CreditObj({credits: 1000000000e6, idealBalance: 1000000000e6})
            );
            // Note: Increase chainPath[chainPathIndex].lkb to avoid underflow
            stdstore
                .target(SG_MAINNET_USDC_POOL)
                .sig("chainPaths(uint256)")
                .with_key(StargatePool(SG_MAINNET_USDC_POOL).chainPathIndexLookup(LZ_OP_CHAIN_ID, SG_USDC_POOL_ID))
                .depth(5)
                .checked_write(100000000000e6);
        } else {
            deal(address(usdc_optimism), whale, amountIn);
            vm.startPrank(whale);
            usdc_optimism.approve(address(sgRouter_optimism), type(uint256).max);
            sgRouter_optimism.addLiquidity(SG_USDC_POOL_ID, amountIn, whale);
            vm.stopPrank();
            vm.prank(address(sgRouter_optimism));
            StargatePool(SG_OP_USDC_POOL).creditChainPath(
                LZ_MAINNET_CHAIN_ID,
                SG_USDC_POOL_ID,
                StargatePool.CreditObj({credits: 1000000000e6, idealBalance: 1000000000e6})
            );
            // Note: Increase chainPath[chainPathIndex].lkb to avoid underflow
            stdstore
                .target(SG_OP_USDC_POOL)
                .sig("chainPaths(uint256)")
                .with_key(StargatePool(SG_OP_USDC_POOL).chainPathIndexLookup(LZ_MAINNET_CHAIN_ID, SG_USDC_POOL_ID))
                .depth(5)
                .checked_write(100000000000e6);
        }
    }

    function _decodeSendToChainEvent(
        Vm.Log memory SendToChain
    ) internal pure returns (uint16 _dstChainId, address from, address to) {
        (bytes memory _toAddress, ) = abi.decode(SendToChain.data, (bytes, uint256));
        _dstChainId = uint16(abi.encodePacked(SendToChain.topics[1]).toUint256(0));
        bytes memory _from = abi.encodePacked(SendToChain.topics[2]);

        from = abi.decode(_from, (address));
        to = _toAddress.toAddress(0);
    }

    function _decodeOftPacketEvent(
        Vm.Log memory Packet
    ) internal pure returns (uint64 _dstGasForCall, bytes memory payload) {
        // Note: Remove prefix added for `Packet` event
        // uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload
        // bytes memory encodedPayload = abi.encodePacked(nonce, localChainId, ua, dstChainId, dstAddress, payload);
        // emit Packet(encodedPayload);
        bytes memory encodedPayload = abi.decode(Packet.data, (bytes));
        payload = encodedPayload.slice(52, encodedPayload.length - 52);
        (, , , , , _dstGasForCall) = abi.decode(payload, (uint16, bytes, bytes, uint256, bytes, uint64));
    }

    function _decodeSgSwapEvents(
        Vm.Log memory Swap,
        Vm.Log memory Packet
    )
        internal
        pure
        returns (
            uint16 srcChainId,
            address from,
            uint256 srcPoolId,
            uint256 dstPoolId,
            uint256 dstGasForCall,
            StargatePool.SwapObj memory swapObj,
            bytes memory payload
        )
    {
        {
            (, , from, , , , , ) = abi.decode(
                Swap.data,
                (uint16, uint256, address, uint256, uint256, uint256, uint256, uint256)
            );
        }

        {
            bytes memory encodedPayload = abi.decode(Packet.data, (bytes));
            // Note: Remove prefix added for `Packet` event
            // uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload
            // bytes memory encodedPayload = abi.encodePacked(nonce, localChainId, ua, dstChainId, dstAddress, payload);
            // emit Packet(encodedPayload);
            srcChainId = encodedPayload.toUint16(8);
            bytes memory payloadWithStargateArgs = encodedPayload.slice(52, encodedPayload.length - 52);

            // Note: Stargate adds additional data to the payload, we have to extract ours from it
            (, srcPoolId, dstPoolId, dstGasForCall, , swapObj, , payload) = abi.decode(
                payloadWithStargateArgs,
                (uint8, uint256, uint256, uint256, StargatePool.CreditObj, StargatePool.SwapObj, bytes, bytes)
            );
        }
    }

    function _decodeRevertEvent(
        Vm.Log memory Revert
    ) internal pure returns (uint16 chainId, bytes memory srcAddress, uint256 nonce) {
        (, chainId, srcAddress, nonce) = abi.decode(Revert.data, (uint8, uint16, bytes, uint256));
    }

    function _decodeCallOFTReceivedFailureEvent(
        Vm.Log memory CallOFTReceivedFailure
    )
        internal
        pure
        returns (
            uint16 srcChainId,
            address to,
            bytes memory srcAddress,
            uint64 nonce,
            bytes memory from,
            uint amount,
            bytes memory payload,
            bytes memory reason
        )
    {
        (srcAddress, nonce, from, amount, payload, reason) = abi.decode(
            CallOFTReceivedFailure.data,
            (bytes, uint64, bytes, uint, bytes, bytes)
        );
        srcChainId = uint16(uint256(CallOFTReceivedFailure.topics[1])); // uint16 indexed srcChainId
        to = address(uint160(uint256(CallOFTReceivedFailure.topics[2]))); // address indexed to
    }

    function _decodeCachedSwapSavedEvent(
        Vm.Log memory CachedSwapSaved
    )
        internal
        pure
        returns (
            uint16 chainId,
            bytes memory srcAddress,
            uint256 nonce,
            address token,
            uint amountLD,
            address to,
            bytes memory payload,
            bytes memory reason
        )
    {
        (chainId, srcAddress, nonce, token, amountLD, to, payload, reason) = abi.decode(
            CachedSwapSaved.data,
            (uint16, bytes, uint256, address, uint256, address, bytes, bytes)
        );
    }

    function _getSgSwapEvents()
        internal
        returns (Vm.Log memory Swap, Vm.Log memory Packet, Vm.Log memory RelayerParams)
    {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("Swap(uint16,uint256,address,uint256,uint256,uint256,uint256,uint256)")) {
                // Emitted when a SG swap is called
                // event Swap(uint16 chainId,uint256 dstPoolId,address from,uint256 amountSD,uint256 eqReward,uint256 eqFee,uint256 protocolFee,uint256 lpFee);
                Swap = entry;
            } else if (entry.topics[0] == keccak256("Packet(bytes)")) {
                // Emitted when LZ message is sent
                // bytes memory encodedPayload = abi.encodePacked(uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload);
                // event Packet(bytes encodedPayload);
                Packet = entry;
            } else if (entry.topics[0] == keccak256("RelayerParams(bytes,uint16)")) {
                // Emitted when LZ parameters are passed to a relayer
                // event RelayerParams(bytes adapterParams, uint16 outboundProofType);
                RelayerParams = entry;
            }
        }
    }

    function _getOftTransferEvents()
        internal
        returns (Vm.Log memory SendToChain, Vm.Log memory Packet, Vm.Log memory RelayerParams)
    {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("SendToChain(uint16,address,bytes,uint256)")) {
                // Emitted when OFT amount is sent
                // event SendToChain(uint16 indexed _dstChainId, address indexed _from, bytes _toAddress, uint _amount);
                SendToChain = entry;
            } else if (entry.topics[0] == keccak256("Packet(bytes)")) {
                // Emitted when LZ message is sent
                // bytes memory encodedPayload = abi.encodePacked(uint64 nonce, uint16 localChainId, address ua, uint16 dstChainId, bytes dstAddress, bytes payload);
                // event Packet(bytes encodedPayload);
                Packet = entry;
            } else if (entry.topics[0] == keccak256("RelayerParams(bytes,uint16)")) {
                // Emitted when LZ parameters are passed to a relayer
                // event RelayerParams(bytes adapterParams, uint16 outboundProofType);
                RelayerParams = entry;
            }
        }
    }

    function _getSgSwapErrorEvents() internal returns (Vm.Log memory CachedSwapSaved, Vm.Log memory Revert) {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (
                entry.topics[0] ==
                keccak256("CachedSwapSaved(uint16,bytes,uint256,address,uint256,address,bytes,bytes)")
            ) {
                // Note: Emitted from SG Router when `sgReceive()` fails
                // event CachedSwapSaved(uint16 chainId, bytes srcAddress, uint256 nonce, address token, uint256 amountLD, address to, bytes payload, bytes reason);
                CachedSwapSaved = entry;
            } else if (entry.topics[0] == keccak256("Revert(uint8,uint16,bytes,uint256)")) {
                // Note: Emitted from SG Router when swap fails on the destination
                // event Revert(uint8 bridgeFunctionType, uint16 chainId, bytes srcAddress, uint256 nonce);
                Revert = entry;
            }
        }
    }

    function _getOftTransferErrorEvents()
        internal
        returns (Vm.Log memory MessageFailed, Vm.Log memory CallOFTReceivedFailure)
    {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics[0] == keccak256("MessageFailed(uint16,bytes,uint64,bytes,bytes)")) {
                // Note: Emitted from `LzApp` when message fails on the destination
                // event MessageFailed(uint16 _srcChainId, bytes _srcAddress, uint64 _nonce, bytes _payload, bytes _reason)
                MessageFailed = entry;
            } else if (
                entry.topics[0] ==
                keccak256("CallOFTReceivedFailure(uint16,bytes,uint64,bytes,address,uint256,bytes,bytes)")
            ) {
                // Note: Emitted from OFT when `onOFTReceived()` fails
                // event CallOFTReceivedFailure(uint16 indexed _srcChainId, bytes _srcAddress, uint64 _nonce, bytes _from, address indexed _to, uint _amount, bytes _payload, bytes _reason);
                CallOFTReceivedFailure = entry;
            }
        }
    }
}
