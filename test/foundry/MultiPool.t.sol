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

error SwapFeatureIsInactive();

contract MultiPool_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;

    address feeCollector = address(999);
    address alice = address(101010);

    uint256 optimismFork;

    IERC20 constant vaUSDC = IERC20(0x539505Dde2B9771dEBE0898a84441c5E7fDF6BC0);
    IERC20 constant usdc = IERC20(0x7F5c764cBc14f9669B88837ca1490cCa17c31607);
    IERC20 constant vaETH = IERC20(0xCcF3d1AcF799bAe67F6e354d685295557cf64761);
    IERC20 constant weth = IERC20(0x4200000000000000000000000000000000000006);
    IERC20 constant sgeth = IERC20(0xb69c8CBCD90A39D8D3d3ccf0a3E968511C3856A0);
    ILayerZeroEndpoint constant lzEndpoint = ILayerZeroEndpoint(0x3c2269811836af69497E5F486A85D7316753cf62);

    MasterOracleMock masterOracle;
    SwapperMock swapper;
    PoolRegistry poolRegistry;
    FeeProvider feeProvider;
    FeeProvider feeProvider_B;
    Pool pool;
    Pool pool_B;
    SmartFarmingManager smartFarmingManager;
    SmartFarmingManager smartFarmingManager_B;
    Treasury treasury;
    SyntheticToken msUSD;
    SyntheticToken msBTC;
    SyntheticToken msETH;
    DebtToken msUSDDebt;
    DebtToken msBTCDebt;
    DebtToken msUSDDebt_B;
    DebtToken msETHDebt_B;
    DepositToken msdUSDC;
    DepositToken msdVaUSDC;
    DepositToken msdVaUSDC_B;
    DepositToken msdVaETH;
    ProxyOFT proxyOFT_msUSD;

    function setUp() public {
        optimismFork = vm.createSelectFork(vm.envString("OPTIMISM_NODE_URL"));
        vm.rollFork(optimismFork, 110325800);

        masterOracle = new MasterOracleMock();
        swapper = new SwapperMock(masterOracle);

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        feeProvider_B = new FeeProvider();
        vm.store(address(feeProvider_B), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        treasury = new Treasury();
        vm.store(address(treasury), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        pool = new Pool();
        vm.store(address(pool), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        pool_B = new Pool();
        vm.store(address(pool_B), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        smartFarmingManager = new SmartFarmingManager();
        vm.store(address(smartFarmingManager), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        smartFarmingManager_B = new SmartFarmingManager();
        vm.store(address(smartFarmingManager_B), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSD = new SyntheticToken();
        vm.store(address(msUSD), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msBTC = new SyntheticToken();
        vm.store(address(msBTC), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msETH = new SyntheticToken();
        vm.store(address(msETH), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSDDebt = new DebtToken();
        vm.store(address(msUSDDebt), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msBTCDebt = new DebtToken();
        vm.store(address(msBTCDebt), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msUSDDebt_B = new DebtToken();
        vm.store(address(msUSDDebt_B), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msETHDebt_B = new DebtToken();
        vm.store(address(msETHDebt_B), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdUSDC = new DepositToken();
        vm.store(address(msdUSDC), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdVaUSDC = new DepositToken();
        vm.store(address(msdVaUSDC), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdVaUSDC_B = new DepositToken();
        vm.store(address(msdVaUSDC_B), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        msdVaETH = new DepositToken();
        vm.store(address(msdVaETH), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        proxyOFT_msUSD = new ProxyOFT();
        vm.store(address(proxyOFT_msUSD), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor

        poolRegistry.initialize({masterOracle_: masterOracle, feeCollector_: feeCollector});
        poolRegistry.toggleBridgingIsActive();
        poolRegistry.toggleDestinationChainIsActive(LZ_MAINNET_CHAIN_ID);
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(0))});
        feeProvider_B.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(0))});
        pool.initialize(poolRegistry);
        pool_B.initialize(poolRegistry);
        smartFarmingManager.initialize(pool);
        smartFarmingManager_B.initialize(pool_B);
        treasury.initialize(pool);

        msdUSDC.initialize({
            underlying_: usdc,
            pool_: pool,
            name_: "msdUSDC-1",
            symbol_: "msdUSDC-1",
            decimals_: 6,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaUSDC.initialize({
            underlying_: vaUSDC,
            pool_: pool,
            name_: "msdVaUSDC-1",
            symbol_: "msdVaUSDC-1",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaUSDC_B.initialize({
            underlying_: vaUSDC,
            pool_: pool_B,
            name_: "msdVaUSDC-2",
            symbol_: "msdVaUSDC-2",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msdVaETH.initialize({
            underlying_: vaETH,
            pool_: pool,
            name_: "msdVaETH-1",
            symbol_: "msdVaETH-1",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint256).max
        });

        msUSD.initialize({name_: "msUSD", symbol_: "msUSD", decimals_: 18, poolRegistry_: pool.poolRegistry()});
        proxyOFT_msUSD.initialize(address(lzEndpoint), msUSD);

        msUSDDebt.initialize({
            name_: "msUSD-Debt-1",
            symbol_: "msUSD-Debt-1",
            pool_: pool,
            syntheticToken_: msUSD,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });
        msUSDDebt_B.initialize({
            name_: "msUSD-Debt-2",
            symbol_: "msUSD-Debt-2",
            pool_: pool_B,
            syntheticToken_: msUSD,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        msBTC.initialize({name_: "msBTC", symbol_: "msBTC", decimals_: 8, poolRegistry_: pool.poolRegistry()});
        msBTCDebt.initialize({
            name_: "msBTC-Debt-1",
            symbol_: "msBTC-Debt-1",
            pool_: pool,
            syntheticToken_: msBTC,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        msETH.initialize({name_: "msETH", symbol_: "msETH", decimals_: 18, poolRegistry_: pool.poolRegistry()});
        msETHDebt_B.initialize({
            name_: "msETH-Debt-2",
            symbol_: "msETH-Debt-2",
            pool_: pool_B,
            syntheticToken_: msETH,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });

        poolRegistry.registerPool(address(pool));
        poolRegistry.registerPool(address(pool_B));
        poolRegistry.updateSwapper(swapper);
        pool.updateFeeProvider(feeProvider);
        pool.updateTreasury(treasury);
        pool.updateSmartFarmingManager(smartFarmingManager);
        pool.addDepositToken(address(msdUSDC));
        pool.addDepositToken(address(msdVaUSDC));
        pool.addDepositToken(address(msdVaETH));
        pool.addDebtToken(msUSDDebt);
        pool.addDebtToken(msBTCDebt);
        pool_B.updateFeeProvider(feeProvider_B);
        pool_B.updateTreasury(treasury);
        pool_B.updateSmartFarmingManager(smartFarmingManager_B);
        pool_B.addDepositToken(address(msdVaUSDC_B));
        pool_B.addDebtToken(msUSDDebt_B);
        pool_B.addDebtToken(msETHDebt_B);
        pool_B.toggleIsSwapActive();
        masterOracle.updatePrice(address(usdc), 1e18);
        masterOracle.updatePrice(address(vaUSDC), 1e18);
        masterOracle.updatePrice(address(vaETH), 2000e18);
        masterOracle.updatePrice(address(weth), 2000e18);
        masterOracle.updatePrice(address(msUSD), 1e18);
        masterOracle.updatePrice(address(msETH), 2000e18);
        masterOracle.updatePrice(address(msBTC), 30000e18);
        proxyOFT_msUSD.setUseCustomAdapterParams(true);
        proxyOFT_msUSD.setMinDstGas(LZ_MAINNET_CHAIN_ID, proxyOFT_msUSD.PT_SEND(), 200_000);
        msUSD.updateProxyOFT(proxyOFT_msUSD);
        msUSD.updateMaxBridgedInSupply(type(uint256).max);
        msUSD.updateMaxBridgedOutSupply(type(uint256).max);
        swapper.updateRate(1e18);

        deal(address(vaUSDC), alice, 1000000e18);

        vm.startPrank(alice);
        vaUSDC.approve(address(msdVaUSDC), type(uint256).max);
        vaUSDC.approve(address(msdVaUSDC_B), type(uint256).max);
        vm.stopPrank();
    }

    // PoolA (swap OK) & PoolB (swap inactive)
    function test_swap() external {
        // given
        vm.startPrank(alice);
        vaUSDC.approve(address(msdVaUSDC), 1000e18);
        msdVaUSDC.deposit(1000e18, alice);
        msUSDDebt.issue(500e18, alice);

        assertEq(msUSD.balanceOf(alice), 500e18);
        assertTrue(pool.isSwapActive());
        assertFalse(pool_B.isSwapActive());

        // when-then
        assertEq(msBTC.balanceOf(alice), 0);
        pool.swap(msUSD, msBTC, 100e18);
        assertGt(msBTC.balanceOf(alice), 0);

        vm.expectRevert(SwapFeatureIsInactive.selector);
        pool_B.swap(msUSD, msETH, 100e18);
        vm.stopPrank();
    }

    // PoolA (10% deposit fee) & PoolB (25% deposit fee)
    function test_fees() external {
        // given
        feeProvider.updateDepositFee(0.1e18);
        feeProvider_B.updateDepositFee(0.25e18);
        uint256 msdVaUSDC_A_before = msdVaUSDC.balanceOf(alice);
        uint256 msdVaUSDC_B_before = msdVaUSDC_B.balanceOf(alice);

        // when
        uint256 amount = 100e18;

        vm.startPrank(alice);
        msdVaUSDC.deposit(amount, alice);
        msdVaUSDC_B.deposit(amount, alice);
        vm.stopPrank();

        // then
        uint256 msdVaUSDC_A_deposits = msdVaUSDC.balanceOf(alice) - msdVaUSDC_A_before;
        uint256 msdVaUSDC_B_deposits = msdVaUSDC_B.balanceOf(alice) - msdVaUSDC_B_before;
        assertEq(msdVaUSDC_A_deposits, 90e18);
        assertEq(msdVaUSDC_B_deposits, 75e18);
    }

    // PoolA (50% CF) & PoolB (10% CF)
    function test_cfs() external {
        // given
        msdVaUSDC.updateCollateralFactor(0.6e18);
        msdVaUSDC_B.updateCollateralFactor(0.1e18);
        vm.startPrank(alice);

        // when
        msdVaUSDC.deposit(100e18, alice);
        msdVaUSDC_B.deposit(100e18, alice);
        vm.stopPrank();

        // then
        // Note: Mocked price for vaUSDC is $1
        (uint256 _depositAInUsd, uint256 _issuableLimitAInUsd) = pool.depositOf(alice);
        assertEq(_depositAInUsd, 100e18);
        assertEq(_issuableLimitAInUsd, 60e18);

        (uint256 _depositBInUsd, uint256 _issuableLimitBInUsd) = pool_B.depositOf(alice);
        assertEq(_depositBInUsd, 100e18);
        assertEq(_issuableLimitBInUsd, 10e18);
    }

    // Both pools issue msUSD
    function test_shared_synth() external {
        // given
        assertTrue(pool.doesSyntheticTokenExist(msUSD));
        assertTrue(pool_B.doesSyntheticTokenExist(msUSD));
        vm.startPrank(alice);
        msdVaUSDC.deposit(1000e18, alice);
        msdVaUSDC_B.deposit(1000e18, alice);

        // when
        msUSDDebt.issue(100e18, alice);
        msUSDDebt_B.issue(100e18, alice);
        vm.stopPrank();

        // then
        assertEq(msUSD.balanceOf(alice), 200e18);
        assertEq(msUSDDebt.balanceOf(alice), 100e18);
        assertEq(msUSDDebt_B.balanceOf(alice), 100e18);
    }

    // PoolA (5% APR) & PoolB (10% APR)
    function test_interests() external {
        // given
        msUSDDebt.updateInterestRate(0.05e18);
        msUSDDebt_B.updateInterestRate(0.10e18);
        vm.startPrank(alice);
        msdVaUSDC.deposit(1000e18, alice);
        msdVaUSDC_B.deposit(1000e18, alice);

        // when
        msUSDDebt.issue(100e18, alice);
        msUSDDebt_B.issue(100e18, alice);
        vm.stopPrank();
        assertEq(msUSD.balanceOf(alice), 200e18);
        assertEq(msUSDDebt.balanceOf(alice), 100e18);
        assertEq(msUSDDebt_B.balanceOf(alice), 100e18);
        vm.warp(block.timestamp + 365 days);

        // then
        assertEq(msUSD.balanceOf(alice), 200e18);
        assertApproxEqAbs(msUSDDebt.balanceOf(alice), 105e18, 1e18);
        assertApproxEqAbs(msUSDDebt_B.balanceOf(alice), 110e18, 1e18);
    }

    // PoolA (msUSD+msBTC) & PoolB (msUSD+msETH)
    function test_isolated_synth() external {
        // given
        assertTrue(poolRegistry.doesSyntheticTokenExist(msUSD));
        assertTrue(poolRegistry.doesSyntheticTokenExist(msBTC));
        assertTrue(poolRegistry.doesSyntheticTokenExist(msETH));

        assertTrue(pool.doesSyntheticTokenExist(msUSD));
        assertTrue(pool.doesSyntheticTokenExist(msBTC));
        assertFalse(pool.doesSyntheticTokenExist(msETH));

        assertTrue(pool_B.doesSyntheticTokenExist(msUSD));
        assertFalse(pool_B.doesSyntheticTokenExist(msBTC));
        assertTrue(pool_B.doesSyntheticTokenExist(msETH));

        vm.startPrank(alice);
        msdVaUSDC.deposit(100000e18, alice);
        msdVaUSDC_B.deposit(100000e18, alice);

        // when
        msBTCDebt.issue(1e8, alice);
        msETHDebt_B.issue(1e18, alice);

        // then
        // Note: Mocked prices: BTC = $30K and ETH = $2K
        assertEq(pool.debtOf(alice), 30000e18);
        assertEq(pool_B.debtOf(alice), 2000e18);
    }
}
