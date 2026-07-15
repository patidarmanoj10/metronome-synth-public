// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {IERC20} from "contracts/dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {BytesLib} from "contracts/dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {ILayerZeroEndpoint} from "contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroEndpoint.sol";
import {PoolRegistry} from "contracts/PoolRegistry.sol";
import {SmartFarmingManager} from "contracts/SmartFarmingManager.sol";
import {Treasury} from "contracts/Treasury.sol";
import {DepositToken} from "contracts/DepositToken.sol";
import {DebtToken} from "contracts/DebtToken.sol";
import {SyntheticToken} from "contracts/SyntheticToken.sol";
import {MasterOracleMock} from "contracts/mock/MasterOracleMock.sol";
import {IESMET} from "contracts/interfaces/external/IESMET.sol";
import {FeeProvider} from "contracts/FeeProvider.sol";
import {Pool} from "contracts/Pool.sol";
import {ProxyOFT} from "contracts/ProxyOFT.sol";
import {SwapperMock} from "contracts/mock/SwapperMock.sol";
import {WadRayMath} from "contracts/lib/WadRayMath.sol";
import {BridgingIsPaused} from "contracts/ProxyOFT.sol";

interface ILayerZeroEndpointExtended is ILayerZeroEndpoint {
    function defaultReceiveLibraryAddress() external view returns (address);
}

abstract contract CrossChains_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;
    uint16 public constant LZ_OP_CHAIN_ID = 111;

    address public constant WETH_MAINNET = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant SGETH_MAINNET = 0x72E2F4830b9E45d52F80aC08CB2bEC0FeF72eD9c;
    address public constant WETH_OP = 0x4200000000000000000000000000000000000006;
    address public constant SGETH_OP = 0xb69c8CBCD90A39D8D3d3ccf0a3E968511C3856A0;

    uint16 constant LZ_ADAPTER_PARAMS_VERSION = 1;
    uint16 constant PT_SEND = 0;
    uint256 constant SIMPLE_TRANSFER_GAS = 200_000;

    address feeCollector = address(999);
    address alice = address(101010);

    uint256 mainnetFork;
    uint256 optimismFork;

    // Layer 2
    IERC20 vaUSDC_optimism = IERC20(0x539505Dde2B9771dEBE0898a84441c5E7fDF6BC0);
    IERC20 usdc_optimism = IERC20(0x7F5c764cBc14f9669B88837ca1490cCa17c31607);
    IERC20 vaETH_optimism = IERC20(0xCcF3d1AcF799bAe67F6e354d685295557cf64761);
    IERC20 weth_optimism = IERC20(WETH_OP);
    ILayerZeroEndpointExtended lzEndpoint_optimism =
        ILayerZeroEndpointExtended(0x3c2269811836af69497E5F486A85D7316753cf62);
    MasterOracleMock masterOracle_optimism;
    SwapperMock swapper_optimism;
    PoolRegistry poolRegistry_optimism;
    FeeProvider feeProvider_optimism;
    FeeProvider feeProvider_B_optimism;
    Pool pool_optimism;
    Pool pool_B_optimism;
    SmartFarmingManager smartFarmingManager_optimism;
    SmartFarmingManager smartFarmingManager_B_optimism;
    Treasury treasury_optimism;
    SyntheticToken msUSD_optimism;
    SyntheticToken msBTC_optimism;
    SyntheticToken msETH_optimism;
    DebtToken msUSDDebt_optimism;
    DebtToken msBTCDebt_optimism;
    DebtToken msUSDDebt_B_optimism;
    DebtToken msETHDebt_B_optimism;
    DepositToken msdUSDC_optimism;
    DepositToken msdVaUSDC_optimism;
    DepositToken msdVaUSDC_B_optimism;
    DepositToken msdVaETH_optimism;
    ProxyOFT proxyOFT_msUSD_optimism;

    // Mainnet
    IERC20 usdc_mainnet = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20 weth_mainnet = IERC20(WETH_MAINNET);
    ILayerZeroEndpointExtended lzEndpoint_mainnet =
        ILayerZeroEndpointExtended(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675);
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
    ProxyOFT proxyOFT_msUSD_mainnet;

    function setUp() public virtual {
        mainnetFork = vm.createSelectFork(vm.envString("MAINNET_NODE_URL"));
        vm.rollFork(mainnetFork, 18262880);

        optimismFork = vm.createSelectFork(vm.envString("OPTIMISM_NODE_URL"));
        vm.rollFork(optimismFork, 110325800);

        //
        // Layer 2
        //
        vm.selectFork(optimismFork);

        masterOracle_optimism = new MasterOracleMock();
        swapper_optimism = new SwapperMock(masterOracle_optimism);

        poolRegistry_optimism = new PoolRegistry();
        vm.store(address(poolRegistry_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        feeProvider_optimism = new FeeProvider();
        vm.store(address(feeProvider_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        feeProvider_B_optimism = new FeeProvider();
        vm.store(address(feeProvider_B_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        treasury_optimism = new Treasury();
        vm.store(address(treasury_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        pool_optimism = new Pool();
        vm.store(address(pool_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        pool_B_optimism = new Pool();
        vm.store(address(pool_B_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        smartFarmingManager_optimism = new SmartFarmingManager();
        vm.store(address(smartFarmingManager_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        smartFarmingManager_B_optimism = new SmartFarmingManager();
        vm.store(address(smartFarmingManager_B_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSD_optimism = new SyntheticToken();
        vm.store(address(msUSD_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msBTC_optimism = new SyntheticToken();
        vm.store(address(msBTC_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msETH_optimism = new SyntheticToken();
        vm.store(address(msETH_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSDDebt_optimism = new DebtToken();
        vm.store(address(msUSDDebt_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msBTCDebt_optimism = new DebtToken();
        vm.store(address(msBTCDebt_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSDDebt_B_optimism = new DebtToken();
        vm.store(address(msUSDDebt_B_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msETHDebt_B_optimism = new DebtToken();
        vm.store(address(msETHDebt_B_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdUSDC_optimism = new DepositToken();
        vm.store(address(msdUSDC_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdVaUSDC_optimism = new DepositToken();
        vm.store(address(msdVaUSDC_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdVaUSDC_B_optimism = new DepositToken();
        vm.store(address(msdVaUSDC_B_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdVaETH_optimism = new DepositToken();
        vm.store(address(msdVaETH_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        proxyOFT_msUSD_optimism = new ProxyOFT();
        vm.store(address(proxyOFT_msUSD_optimism), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        poolRegistry_optimism.initialize({masterOracle_: masterOracle_optimism, feeCollector_: feeCollector});
        poolRegistry_optimism.toggleBridgingIsActive();
        poolRegistry_optimism.toggleDestinationChainIsActive(LZ_MAINNET_CHAIN_ID);
        feeProvider_optimism.initialize({poolRegistry_: poolRegistry_optimism, esMET_: IESMET(address(0))});
        feeProvider_B_optimism.initialize({poolRegistry_: poolRegistry_optimism, esMET_: IESMET(address(0))});
        pool_optimism.initialize(poolRegistry_optimism);
        pool_B_optimism.initialize(poolRegistry_optimism);
        smartFarmingManager_optimism.initialize(pool_optimism);
        smartFarmingManager_B_optimism.initialize(pool_B_optimism);
        treasury_optimism.initialize(pool_optimism);

        msdUSDC_optimism.initialize({
            underlying_: usdc_optimism,
            pool_: pool_optimism,
            name_: "msdUSDC-1",
            symbol_: "msdUSDC-1",
            decimals_: 6,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaUSDC_optimism.initialize({
            underlying_: vaUSDC_optimism,
            pool_: pool_optimism,
            name_: "msdVaUSDC-1",
            symbol_: "msdVaUSDC-1",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaUSDC_B_optimism.initialize({
            underlying_: vaUSDC_optimism,
            pool_: pool_B_optimism,
            name_: "msdVaUSDC-2",
            symbol_: "msdVaUSDC-2",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaETH_optimism.initialize({
            underlying_: vaETH_optimism,
            pool_: pool_optimism,
            name_: "msdVaETH-1",
            symbol_: "msdVaETH-1",
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
        proxyOFT_msUSD_optimism.initialize(address(lzEndpoint_optimism), msUSD_optimism);

        msUSDDebt_optimism.initialize({
            name_: "msUSD-Debt-1",
            symbol_: "msUSD-Debt-1",
            pool_: pool_optimism,
            syntheticToken_: msUSD_optimism,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });
        msUSDDebt_B_optimism.initialize({
            name_: "msUSD-Debt-2",
            symbol_: "msUSD-Debt-2",
            pool_: pool_B_optimism,
            syntheticToken_: msUSD_optimism,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        msBTC_optimism.initialize({
            name_: "msBTC",
            symbol_: "msBTC",
            decimals_: 8,
            poolRegistry_: pool_optimism.poolRegistry()
        });
        msBTCDebt_optimism.initialize({
            name_: "msBTC-Debt-1",
            symbol_: "msBTC-Debt-1",
            pool_: pool_optimism,
            syntheticToken_: msBTC_optimism,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        msETH_optimism.initialize({
            name_: "msETH",
            symbol_: "msETH",
            decimals_: 18,
            poolRegistry_: pool_optimism.poolRegistry()
        });
        msETHDebt_B_optimism.initialize({
            name_: "msETH-Debt-2",
            symbol_: "msETH-Debt-2",
            pool_: pool_B_optimism,
            syntheticToken_: msETH_optimism,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        poolRegistry_optimism.registerPool(address(pool_optimism));
        poolRegistry_optimism.registerPool(address(pool_B_optimism));
        poolRegistry_optimism.updateSwapper(swapper_optimism);
        pool_optimism.updateFeeProvider(feeProvider_optimism);
        pool_optimism.updateTreasury(treasury_optimism);
        pool_optimism.updateSmartFarmingManager(smartFarmingManager_optimism);
        pool_optimism.addDepositToken(address(msdUSDC_optimism));
        pool_optimism.addDepositToken(address(msdVaUSDC_optimism));
        pool_optimism.addDepositToken(address(msdVaETH_optimism));
        pool_optimism.addDebtToken(msUSDDebt_optimism);
        pool_optimism.addDebtToken(msBTCDebt_optimism);
        pool_B_optimism.updateFeeProvider(feeProvider_B_optimism);
        pool_B_optimism.updateTreasury(treasury_optimism);
        pool_B_optimism.updateSmartFarmingManager(smartFarmingManager_B_optimism);
        pool_B_optimism.addDepositToken(address(msdVaUSDC_B_optimism));
        pool_B_optimism.addDebtToken(msUSDDebt_B_optimism);
        pool_B_optimism.addDebtToken(msETHDebt_B_optimism);
        pool_B_optimism.toggleIsSwapActive();
        masterOracle_optimism.updatePrice(address(usdc_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(vaUSDC_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(vaETH_optimism), 2000e18);
        masterOracle_optimism.updatePrice(address(weth_optimism), 2000e18);
        masterOracle_optimism.updatePrice(address(msUSD_optimism), 1e18);
        masterOracle_optimism.updatePrice(address(msETH_optimism), 2000e18);
        masterOracle_optimism.updatePrice(address(msBTC_optimism), 30000e18);
        proxyOFT_msUSD_optimism.setUseCustomAdapterParams(true);
        proxyOFT_msUSD_optimism.setMinDstGas(LZ_MAINNET_CHAIN_ID, proxyOFT_msUSD_optimism.PT_SEND(), 200_000);
        msUSD_optimism.updateProxyOFT(proxyOFT_msUSD_optimism);
        msUSD_optimism.updateMaxBridgedInSupply(type(uint256).max);
        msUSD_optimism.updateMaxBridgedOutSupply(type(uint256).max);
        swapper_optimism.updateRate(1e18);

        //
        // Mainnet
        //
        vm.selectFork(mainnetFork);

        masterOracle_mainnet = new MasterOracleMock();
        swapper_mainnet = new SwapperMock(masterOracle_mainnet);

        poolRegistry_mainnet = new PoolRegistry();
        vm.store(address(poolRegistry_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        feeProvider_mainnet = new FeeProvider();
        vm.store(address(feeProvider_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        treasury_mainnet = new Treasury();
        vm.store(address(treasury_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        pool_mainnet = new Pool();
        vm.store(address(pool_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        smartFarmingManager_mainnet = new SmartFarmingManager();
        vm.store(address(smartFarmingManager_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSD_mainnet = new SyntheticToken();
        vm.store(address(msUSD_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSDDebt_mainnet = new DebtToken();
        vm.store(address(msUSDDebt_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdUSDC_mainnet = new DepositToken();
        vm.store(address(msdUSDC_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        proxyOFT_msUSD_mainnet = new ProxyOFT();
        vm.store(address(proxyOFT_msUSD_mainnet), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        poolRegistry_mainnet.initialize({masterOracle_: masterOracle_mainnet, feeCollector_: feeCollector});
        poolRegistry_mainnet.toggleBridgingIsActive();
        poolRegistry_mainnet.toggleDestinationChainIsActive(LZ_OP_CHAIN_ID);
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
        proxyOFT_msUSD_mainnet.initialize(address(lzEndpoint_mainnet), msUSD_mainnet);

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
        masterOracle_mainnet.updatePrice(address(weth_mainnet), 2000e18);
        proxyOFT_msUSD_mainnet.setUseCustomAdapterParams(true);
        proxyOFT_msUSD_mainnet.setMinDstGas(LZ_OP_CHAIN_ID, proxyOFT_msUSD_mainnet.PT_SEND(), 200_000);
        msUSD_mainnet.updateProxyOFT(proxyOFT_msUSD_mainnet);
        msUSD_mainnet.updateMaxBridgedInSupply(type(uint256).max);
        msUSD_mainnet.updateMaxBridgedOutSupply(type(uint256).max);
        swapper_mainnet.updateRate(1e18);

        // Labels
        vm.label(alice, "Alice");
        vm.label(feeCollector, "FeeCollector");

        vm.label(address(lzEndpoint_optimism), "LzEndpoint OP");
        vm.label(address(msUSD_optimism), "msUSD OP");
        vm.label(address(msBTC_optimism), "msBTC OP");
        vm.label(address(msETH_optimism), "msETH OP");
        vm.label(address(usdc_optimism), "USDC OP");
        vm.label(address(vaUSDC_optimism), "vaUSDC OP");

        vm.label(address(lzEndpoint_mainnet), "LzEndpoint Mainnet");
        vm.label(address(msUSD_mainnet), "msUSD Mainnet");
        vm.label(address(usdc_mainnet), "USDC Mainnet");

        // Setup
        vm.selectFork(optimismFork);

        proxyOFT_msUSD_optimism.setTrustedRemote(
            LZ_MAINNET_CHAIN_ID,
            abi.encodePacked(address(proxyOFT_msUSD_mainnet), address(proxyOFT_msUSD_optimism))
        );

        deal(address(usdc_optimism), address(swapper_optimism), 1000000000000000e6);
        deal(address(vaUSDC_optimism), address(swapper_optimism), 1000000000000000e18);
        deal(address(weth_optimism), address(swapper_optimism), 100000e18);
        deal(address(vaETH_optimism), address(swapper_optimism), 10000000e18);

        vm.selectFork(mainnetFork);

        proxyOFT_msUSD_mainnet.setTrustedRemote(
            LZ_OP_CHAIN_ID,
            abi.encodePacked(address(proxyOFT_msUSD_optimism), address(proxyOFT_msUSD_mainnet))
        );

        deal(address(usdc_mainnet), address(swapper_mainnet), 1000000000e6);
        deal(address(msUSD_mainnet), address(swapper_mainnet), 1000000000e18);
        deal(address(weth_mainnet), address(swapper_mainnet), 100000e18);
    }

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
            uint256 fee = proxyOFT_msUSD_mainnet.estimateSendFee(dstChainId, alice, amount);

            vm.startPrank(alice);
            deal(alice, fee);
            proxyOFT_msUSD_mainnet.sendFrom{value: fee}(alice, dstChainId, alice, amount);
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
        uint256 fee = proxyOFT_msUSD_mainnet.estimateSendFee(dstChainId, alice, amount);

        deal(alice, fee);
        vm.startPrank(alice);
        vm.expectRevert(BridgingIsPaused.selector);
        proxyOFT_msUSD_mainnet.sendFrom{value: fee}(alice, dstChainId, alice, amount);
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
            uint256 fee = proxyOFT_msUSD_optimism.estimateSendFee(dstChainId, alice, amount);

            vm.startPrank(alice);
            deal(alice, fee);
            proxyOFT_msUSD_optimism.sendFrom{value: fee}(alice, dstChainId, alice, amount);
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
        uint256 fee = proxyOFT_msUSD_optimism.estimateSendFee(dstChainId, alice, amount);

        deal(alice, fee);
        vm.startPrank(alice);
        vm.expectRevert(BridgingIsPaused.selector);
        proxyOFT_msUSD_optimism.sendFrom{value: fee}(alice, dstChainId, alice, amount);
        vm.stopPrank();
    }
}
