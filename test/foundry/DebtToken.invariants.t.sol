// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {DebtTokenHandler} from "./handlers/DebtTokenHandler.sol";
import {DepositTokenHandler} from "./handlers/DepositTokenHandler.sol";
import {FeeProviderHandler} from "./handlers/FeeProviderHandler.sol";
import {PoolRegistry} from "contracts/PoolRegistry.sol";
import {Treasury} from "contracts/Treasury.sol";
import {Pool} from "contracts/Pool.sol";
import {DepositToken} from "contracts/DepositToken.sol";
import {ERC20Mock} from "contracts/mock/ERC20Mock.sol";
import {MasterOracleMock} from "contracts/mock/MasterOracleMock.sol";
import {IESMET} from "contracts/interfaces/external/IESMET.sol";
import {SyntheticToken} from "contracts/SyntheticToken.sol";
import {DebtToken} from "contracts/DebtToken.sol";
import {FeeProvider} from "contracts/FeeProvider.sol";
import {SmartFarmingManager} from "contracts/SmartFarmingManager.sol";

contract DebtTokenInvariant_Test is Test {
    MasterOracleMock masterOracle;
    PoolRegistry poolRegistry;
    address feeCollector = address(2);
    FeeProvider feeProvider;
    Treasury treasury;
    Pool pool;
    ERC20Mock underlying;
    DepositToken depositToken;
    SyntheticToken syntheticToken;
    DebtToken debtToken;

    DebtTokenHandler debtTokenHandler;
    DepositTokenHandler depositTokenHandler;
    FeeProviderHandler feeProviderHandler;

    function setUp() public {
        masterOracle = new MasterOracleMock();

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: masterOracle, feeCollector_: feeCollector});

        ERC20Mock esMET = new ERC20Mock("esMET", "esMET", 18);
        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});

        pool = new Pool();
        vm.store(address(pool), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        pool.initialize(poolRegistry);
        pool.updateFeeProvider(feeProvider);
        poolRegistry.registerPool(address(pool));

        SmartFarmingManager smartFarmingManager = new SmartFarmingManager();
        vm.store(address(smartFarmingManager), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        smartFarmingManager.initialize(pool);
        pool.updateSmartFarmingManager(smartFarmingManager);

        underlying = new ERC20Mock("dai", "dai", 18);

        depositToken = new DepositToken();
        vm.store(address(depositToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        depositToken.initialize({
            underlying_: underlying,
            pool_: pool,
            name_: "msdDAI",
            symbol_: "msdDAI",
            decimals_: 18,
            collateralFactor_: 0.5e18,
            maxTotalSupply_: type(uint128).max
        });
        pool.addDepositToken(address(depositToken));

        syntheticToken = new SyntheticToken();
        vm.store(address(syntheticToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        syntheticToken.initialize({name_: "msUSD", symbol_: "msUSD", decimals_: 18, poolRegistry_: poolRegistry});
        syntheticToken.updateMaxTotalSupply(type(uint128).max);

        debtToken = new DebtToken();
        vm.store(address(debtToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        debtToken.initialize({
            name_: "msUSD-Debt",
            symbol_: "msUSD-Debt",
            pool_: pool,
            syntheticToken_: syntheticToken,
            interestRate_: 0,
            maxTotalSupply_: type(uint256).max
        });
        pool.addDebtToken(debtToken);

        treasury = new Treasury();
        vm.store(address(treasury), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        treasury.initialize(pool);
        pool.updateTreasury(treasury);

        masterOracle.updatePrice(address(underlying), 1e18);
        masterOracle.updatePrice(address(syntheticToken), 1e18);

        debtTokenHandler = new DebtTokenHandler(debtToken);
        depositTokenHandler = new DepositTokenHandler(depositToken);
        feeProviderHandler = new FeeProviderHandler(feeProvider);

        targetContract(address(debtTokenHandler));

        bytes4[] memory depositTokenSelectors = new bytes4[](2);
        depositTokenSelectors[0] = DepositTokenHandler.deposit.selector;
        depositTokenSelectors[1] = DepositTokenHandler.updatePrice.selector;
        targetSelector(FuzzSelector({addr: address(depositTokenHandler), selectors: depositTokenSelectors}));

        bytes4[] memory feeProviderSelectors = new bytes4[](2);
        feeProviderSelectors[0] = FeeProviderHandler.updateIssueFee.selector;
        feeProviderSelectors[1] = FeeProviderHandler.updateRepayFee.selector;
        targetSelector(FuzzSelector({addr: address(feeProviderHandler), selectors: feeProviderSelectors}));
        targetContract(address(feeProviderHandler));

        targetSender(address(0x10));
        targetSender(address(0x11));
        targetSender(address(0x12));
        targetSender(address(0x13));
        targetSender(address(0x14));
    }

    function invariant_debtAndSynthSupply() public {
        (, uint256 _pendingInterestFee) = debtToken.getPendingInterestFee();
        assertEq(debtToken.totalSupply(), syntheticToken.totalSupply() + _pendingInterestFee);
    }

    function invariant_sumOfDebtBalances() public {
        address[] memory actors = debtTokenHandler.getActors();

        // Note: Pool may have debt because we're using it to issue and top up other accounts if needed
        uint256 acc = debtToken.balanceOf(address(pool)) + debtToken.balanceOf(address(feeCollector));
        for (uint i = 0; i < actors.length; ++i) {
            acc += debtToken.balanceOf(actors[i]);
        }

        uint256 _totalSupply = debtToken.totalSupply();

        if (_totalSupply >= 1e18) {
            assertApproxEqRel(acc, _totalSupply, 0.000001e18);
        } else {
            assertApproxEqAbs(acc, _totalSupply, 1e6);
        }
    }

    function invariant_sumOfSynthBalances() public {
        address[] memory actors = debtTokenHandler.getActors();

        uint256 acc = syntheticToken.balanceOf(address(feeCollector)) + syntheticToken.balanceOf(address(pool));
        for (uint i = 0; i < actors.length; ++i) {
            acc += syntheticToken.balanceOf(actors[i]);
        }

        assertEq(acc, syntheticToken.totalSupply());
    }

    function invariant_callSummary() external view {
        depositTokenHandler.callSummary();
        debtTokenHandler.callSummary();
        feeProviderHandler.callSummary();
    }

    function test_issue() external {
        debtToken.updateInterestRate(0.1e18);

        address user = address(87123762346);

        vm.startPrank(user);

        uint depositAmount = 100e18;
        underlying.mint(user, depositAmount);
        underlying.approve(address(depositToken), depositAmount);
        depositToken.deposit(depositAmount, user);

        uint issueAmount = 1e18;
        debtToken.issue(issueAmount, user);

        vm.warp(block.timestamp + 1 days);

        debtToken.issue(issueAmount, user); // 97,316 (with minting) | 79,317 (without mining)
        debtToken.issue(issueAmount, user); // 49,626

        vm.stopPrank();
    }
}
