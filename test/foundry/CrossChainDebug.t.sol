// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {BytesLib} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {ILayerZeroReceiver} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroReceiver.sol";
import {ILayerZeroEndpoint} from "../../contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroEndpoint.sol";
import {Pool as StargatePool} from "../../contracts/dependencies/stargate-protocol/Pool.sol";
import {IStargateRouter} from "../../contracts/dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
import {IStargateComposerWithRetry} from "../../contracts/interfaces/external/IStargateComposerWithRetry.sol";
import {IStargateReceiver} from "../../contracts/dependencies/stargate-protocol/interfaces/IStargateReceiver.sol";
import {PoolRegistry} from "../../contracts/PoolRegistry.sol";
import {Pool, ISyntheticToken, IERC20} from "../../contracts/Pool.sol";
import {SmartFarmingManager} from "../../contracts/SmartFarmingManager.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {DepositToken} from "../../contracts/DepositToken.sol";
import {DebtToken} from "../../contracts/DebtToken.sol";
import {SyntheticToken} from "../../contracts/SyntheticToken.sol";
import {ProxyOFT, IProxyOFT, BridgingIsPaused} from "../../contracts/ProxyOFT.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {MasterOracleMock} from "../../contracts/mock/MasterOracleMock.sol";
import {SwapperMock, ISwapper} from "../../contracts/mock/SwapperMock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";
import {Quoter, IQuoter} from "../../contracts/Quoter.sol";
import {CrossChainDispatcher} from "../../contracts/CrossChainDispatcher.sol";
import {WadRayMath} from "../../contracts/lib/WadRayMath.sol";
import {CrossChainLib} from "../../contracts/lib/CrossChainLib.sol";

contract CrossChainDebug_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;
    uint16 public constant LZ_OP_CHAIN_ID = 111;

    uint256 public constant SG_USDC_POOL_ID = 1;
    uint256 public constant SG_WETH_POOL_ID = 13;

    address public constant SG_OP_USDC_POOL = 0xDecC0c09c3B5f6e92EF4184125D5648a66E35298;
    address public constant SG_MAINNET_USDC_POOL = 0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56;

    address public constant WETH_MAINNET = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant SGETH_MAINNET = 0x72E2F4830b9E45d52F80aC08CB2bEC0FeF72eD9c;
    address public constant WETH_OP = 0x4200000000000000000000000000000000000006;
    address public constant SGETH_OP = 0xb69c8CBCD90A39D8D3d3ccf0a3E968511C3856A0;

    address alice = address(10);

    uint256 mainnetFork;
    uint256 optimismFork;

    // OP
    IERC20 vaUSDC_optimism = IERC20(0x539505Dde2B9771dEBE0898a84441c5E7fDF6BC0);
    IERC20 usdc_optimism = IERC20(0x7F5c764cBc14f9669B88837ca1490cCa17c31607);
    IERC20 vaETH_optimism = IERC20(0xCcF3d1AcF799bAe67F6e354d685295557cf64761);
    IERC20 weth_optimism = IERC20(WETH_OP);
    ILayerZeroEndpoint lzEndpoint_optimism = ILayerZeroEndpoint(0x3c2269811836af69497E5F486A85D7316753cf62);
    IStargateRouter sgRouter_optimism = IStargateRouter(0xB0D502E938ed5f4df2E681fE6E419ff29631d62b);
    IStargateComposerWithRetry sgComposer_optimism =
        IStargateComposerWithRetry(0xeCc19E177d24551aA7ed6Bc6FE566eCa726CC8a9);
    // MasterOracleMock masterOracle_optimism;
    // SwapperMock swapper_optimism;
    PoolRegistry poolRegistry_optimism = PoolRegistry(payable(0xe7C65eAEb1Ca920f0DB73cDFb4915Dd31472a6a1));
    // FeeProvider feeProvider_optimism;
    // Pool pool_optimism;
    SmartFarmingManager smartFarmingManager_optimism = SmartFarmingManager(0x696Ee5a8c82e621eCcc4909Ff020950b146351a0);
    CrossChainDispatcher crossChainDispatcher_optimism =
        CrossChainDispatcher(payable(0xCEA698Cf2420433E21BeC006F1718216c6198B52));
    // Treasury treasury_optimism;
    SyntheticToken msUSD_optimism = SyntheticToken(0x9dAbAE7274D28A45F0B65Bf8ED201A5731492ca0);
    // DebtToken msUSDDebt_optimism;
    // DepositToken msdUSDC_optimism = DepositToken(payable(0xd2e32323686de92411639d446396AFA5E6149C28));
    DepositToken msdVaUSDC_optimism = DepositToken(payable(0x4E71790712424f246358D08A4De6C9896482dE64));
    // DepositToken msdVaETH_optimism;
    ProxyOFT proxyOFT_msUSD_optimism = ProxyOFT(0xc2C433D36d7184192E442a243b351a9e3055FD5f);
    // Quoter quoter_optimism;

    CrossChainDispatcher crossChainDispatcher_optimism_NEW_IMPL;
    SmartFarmingManager smartFarmingManager_optimism_NEW_IMPL;

    // Mainnet
    IERC20 usdc_mainnet = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20 weth_mainnet = IERC20(WETH_MAINNET);
    ILayerZeroEndpoint lzEndpoint_mainnet = ILayerZeroEndpoint(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675);
    IStargateRouter sgRouter_mainnet = IStargateRouter(0x8731d54E9D02c286767d56ac03e8037C07e01e98);
    IStargateComposerWithRetry sgComposer_mainnet =
        IStargateComposerWithRetry(0xeCc19E177d24551aA7ed6Bc6FE566eCa726CC8a9);

    // MasterOracleMock masterOracle_mainnet;
    // SwapperMock swapper_mainnet;
    // Treasury treasury_mainnet;
    PoolRegistry poolRegistry_mainnet = PoolRegistry(payable(0x11eaD85C679eAF528c9C1FE094bF538Db880048A));

    // FeeProvider feeProvider_mainnet;
    // Pool pool_mainnet;
    // SmartFarmingManager smartFarmingManager_mainnet;
    CrossChainDispatcher crossChainDispatcher_mainnet =
        CrossChainDispatcher(payable(0x8BD81c99a2D349F6fB8E8a0B32C81704e3FE7302));

    CrossChainDispatcher crossChainDispatcher_mainnet_NEW_IMPL;

    SyntheticToken msUSD_mainnet = SyntheticToken(0xab5eB14c09D416F0aC63661E57EDB7AEcDb9BEfA);
    // DebtToken msUSDDebt_mainnet;
    // DepositToken msdUSDC_mainnet;
    ProxyOFT proxyOFT_msUSD_mainnet = ProxyOFT(0xF37982E3F33ac007C690eD6266F3402d24aA27Ea);

    // Quoter quoter_mainnet;

    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    address constant MANOJ_WALLET = 0xdf826ff6518e609E4cEE86299d40611C148099d5;

    function setUp() public {
        // mainnetFork = vm.createSelectFork("https://eth.connect.bloq.cloud/v1/peace-blood-actress");
        mainnetFork = vm.createSelectFork("https://eth-mainnet.g.alchemy.com/v2/DAcPqBIVkeOOgYLlHxFUQ0jySiZ-k8_6");
        vm.rollFork(mainnetFork, 18328826);

        optimismFork = vm.createSelectFork("https://optimism-mainnet.infura.io/v3/6e804eea3058430b901e7b2853e9672a");
        vm.rollFork(optimismFork, 110724123);

        //
        // Upgrade contracts
        //
        vm.selectFork(optimismFork);
        smartFarmingManager_optimism_NEW_IMPL = new SmartFarmingManager();
        vm.store(
            address(smartFarmingManager_optimism),
            _IMPLEMENTATION_SLOT,
            bytes32(uint256(uint160(address(smartFarmingManager_optimism_NEW_IMPL))))
        );

        crossChainDispatcher_optimism_NEW_IMPL = new CrossChainDispatcher();
        vm.store(
            address(crossChainDispatcher_optimism),
            _IMPLEMENTATION_SLOT,
            bytes32(uint256(uint160(address(crossChainDispatcher_optimism_NEW_IMPL))))
        );

        vm.selectFork(mainnetFork);
        crossChainDispatcher_mainnet_NEW_IMPL = new CrossChainDispatcher();
        vm.store(
            address(crossChainDispatcher_mainnet),
            _IMPLEMENTATION_SLOT,
            bytes32(uint256(uint160(address(crossChainDispatcher_mainnet_NEW_IMPL))))
        );
    }

    // tx1: https://optimistic.etherscan.io/tx/0x354cf0e6c2ce80c4fd20892abfcd3ed620ecdb7e6e4d6e68b20abc5c8a97a664
    // tx1->tx2: https://layerzeroscan.com/111/address/0xc2c433d36d7184192e442a243b351a9e3055fd5f/message/101/address/0xf37982e3f33ac007c690ed6266f3402d24aa27ea/nonce/2
    // tx2 (failed Receiver+OOG): https://etherscan.io/tx/0x4116fb586df325a00ab87e9a4e402e50354acf11d19827ad4abd98c71454193e
    function test_nonce2_retry() external {
        vm.selectFork(mainnetFork);

        deal(address(crossChainDispatcher_mainnet), 1e18);

        uint256 msUSD_Before = msUSD_mainnet.balanceOf(address(crossChainDispatcher_mainnet));

        proxyOFT_msUSD_mainnet.retryOFTReceived(
            111,
            hex"C2C433D36D7184192E442A243B351A9E3055FD5FF37982E3F33AC007C690ED6266F3402D24AA27EA",
            2,
            hex"CEA698CF2420433E21BEC006F1718216C6198B52",
            address(crossChainDispatcher_mainnet),
            4998703150000000000, // ~5e18
            hex"0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000C0000000000000000000000000696EE5A8C82E621ECCC4909FF020950B146351A0000000000000000000000000F37982E3F33AC007C690ED6266F3402D24AA27EAD3604DB978F6137B0D18816B77B2CE810487A3AF08A922E0B184963BE5F3ADFC0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000DF826FF6518E609E4CEE86299D40611C148099D50000000000000000000000000000000000000000000000000000000000000001"
        );

        assertApproxEqAbs(msUSD_mainnet.balanceOf(address(crossChainDispatcher_mainnet)), msUSD_Before - 5e18, 0.5e18);
    }

    // tx1: https://optimistic.etherscan.io/tx/0x3b3e376b71d4402f1b6631a7de74bf6584d982a1a8587e302e0ae5c15c2988ec
    // tx1->tx2: https://layerzeroscan.com/111/address/0xc2c433d36d7184192e442a243b351a9e3055fd5f/message/101/address/0xf37982e3f33ac007c690ed6266f3402d24aa27ea/nonce/3
    // tx2 (failed OOG): https://etherscan.io/tx/0x0eb8b18b026bd3ac4e0591273441a33d3841e17d32ac35c7df2754381d93e964
    function test_nonce3_check_gas() external {
        vm.rollFork(mainnetFork, 18324358); // 1 block before actual block
        vm.selectFork(mainnetFork);

        deal(address(crossChainDispatcher_mainnet), 1e18);

        vm.prank(0x4D73AdB72bC3DD368966edD0f0b2148401A178E2); // LZ UltraLightNodeV2
        ILayerZeroEndpoint(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675).receivePayload(
            111,
            hex"c2c433d36d7184192e442a243b351a9e3055fd5ff37982e3f33ac007c690ed6266f3402d24aa27ea",
            0xF37982E3F33ac007C690eD6266F3402d24aA27Ea,
            3,
            // 950000
            1700000, // 1.5M + 200k (min)
            //hex"000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000045646854de0c9000000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000b71b00000000000000000000000000000000000000000000000000000000000000014cea698cf2420433e21bec006f1718216c6198b5200000000000000000000000000000000000000000000000000000000000000000000000000000000000000148bd81c99a2d349f6fb8e8a0b32c81704e3fe730200000000000000000000000000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000696ee5a8c82e621eccc4909ff020950b146351a0000000000000000000000000f37982e3f33ac007c690ed6266f3402d24aa27ea9dcb9783ba5cd0b54745f65f4f918525e461e91888c334e5342cb380ac558d530000000000000000000000000000000000000000000000000000000000000001000000000000000000000000df826ff6518e609e4cee86299d40611c148099d50000000000000000000000000000000000000000000000000000000000000001"
            // 750K gas (B71B0) -> 1.5M gas (16E360)
            hex"000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000045646854de0c90000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000016E3600000000000000000000000000000000000000000000000000000000000000014cea698cf2420433e21bec006f1718216c6198b5200000000000000000000000000000000000000000000000000000000000000000000000000000000000000148bd81c99a2d349f6fb8e8a0b32c81704e3fe730200000000000000000000000000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000696ee5a8c82e621eccc4909ff020950b146351a0000000000000000000000000f37982e3f33ac007c690ed6266f3402d24aa27ea9dcb9783ba5cd0b54745f65f4f918525e461e91888c334e5342cb380ac558d530000000000000000000000000000000000000000000000000000000000000001000000000000000000000000df826ff6518e609e4cee86299d40611c148099d50000000000000000000000000000000000000000000000000000000000000001"
        );
    }

    function test_nonce3_retry() external {
        vm.selectFork(mainnetFork);

        deal(address(crossChainDispatcher_mainnet), 1e18);

        uint256 msUSD_Before = msUSD_mainnet.balanceOf(address(crossChainDispatcher_mainnet));

        proxyOFT_msUSD_mainnet.retryOFTReceived(
            111,
            hex"C2C433D36D7184192E442A243B351A9E3055FD5FF37982E3F33AC007C690ED6266F3402D24AA27EA",
            3,
            hex"CEA698CF2420433E21BEC006F1718216C6198B52",
            address(crossChainDispatcher_mainnet),
            5000236200000000000, // ~5
            hex"0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000C0000000000000000000000000696EE5A8C82E621ECCC4909FF020950B146351A0000000000000000000000000F37982E3F33AC007C690ED6266F3402D24AA27EA9DCB9783BA5CD0B54745F65F4F918525E461E91888C334E5342CB380AC558D530000000000000000000000000000000000000000000000000000000000000001000000000000000000000000DF826FF6518E609E4CEE86299D40611C148099D50000000000000000000000000000000000000000000000000000000000000001"
        );

        assertApproxEqAbs(msUSD_mainnet.balanceOf(address(crossChainDispatcher_mainnet)), msUSD_Before - 5e18, 0.5e18);
    }
}
