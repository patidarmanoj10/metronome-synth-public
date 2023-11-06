// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {PoolHandler} from "./handlers/PoolHandler.sol";
import {DepositTokenHandler} from "./handlers/DepositTokenHandler.sol";
import {SyntheticTokenHandler} from "./handlers/SyntheticTokenHandler.sol";
import {DebtTokenHandler} from "./handlers/DebtTokenHandler.sol";
import {FeeProviderHandler} from "./handlers/FeeProviderHandler.sol";
import {PoolRegistry} from "../../contracts/PoolRegistry.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {Pool} from "../../contracts/Pool.sol";
import {MasterOracleMock, IMasterOracle} from "../../contracts/mock/MasterOracleMock.sol";
import {SwapperMock} from "../../contracts/mock/SwapperMock.sol";
import {DepositToken, IDepositToken} from "../../contracts/DepositToken.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";
import {SyntheticToken, ISyntheticToken} from "../../contracts/SyntheticToken.sol";
import {DebtToken, IDebtToken} from "../../contracts/DebtToken.sol";

contract PoolInvariant_Test is Test {
    MasterOracleMock masterOracle;
    PoolRegistry poolRegistry;
    address feeCollector = address(2);
    FeeProvider feeProvider;
    Treasury treasury;
    Pool pool;
    SwapperMock swapper;

    PoolHandler poolHandler;
    DepositTokenHandler[] depositTokenHandlers;
    SyntheticTokenHandler[] syntheticTokenHandlers;
    DebtTokenHandler[] debtTokenHandlers;
    FeeProviderHandler feeProviderHandler;

    address[] accounts;

    function setUp() public {
        masterOracle = new MasterOracleMock();
        swapper = new SwapperMock(masterOracle);

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

        treasury = new Treasury();
        vm.store(address(treasury), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        treasury.initialize(pool);
        pool.updateTreasury(treasury);

        uint256 numOfSynths = 2;
        uint256 numOfCollaterals = 2;

        for (uint256 i; i < numOfCollaterals; ++i) {
            ERC20Mock underlying = new ERC20Mock("underlying", "underlying", 18);
            masterOracle.updatePrice(address(underlying), 1e18);

            DepositToken depositToken = new DepositToken();
            vm.store(address(depositToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
            depositToken.initialize({
                underlying_: underlying,
                pool_: pool,
                name_: "msdUnderlying",
                symbol_: "msdUnderlying",
                decimals_: 18,
                collateralFactor_: 0.5e18,
                maxTotalSupply_: type(uint256).max
            });

            pool.addDepositToken(address(depositToken));

            DepositTokenHandler depositTokenHandler = new DepositTokenHandler(depositToken);
            bytes4[] memory selectors = new bytes4[](4);
            selectors[0] = DepositTokenHandler.deposit.selector;
            selectors[1] = DepositTokenHandler.withdraw.selector;
            selectors[2] = DepositTokenHandler.transfer.selector;
            selectors[3] = DepositTokenHandler.updateCollateralFactor.selector;
            targetSelector(FuzzSelector({addr: address(depositTokenHandler), selectors: selectors}));
            targetContract(address(depositTokenHandler));
            depositTokenHandlers.push(depositTokenHandler);
        }

        for (uint256 i; i < numOfSynths; ++i) {
            SyntheticToken syntheticToken = new SyntheticToken();
            vm.store(address(syntheticToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
            masterOracle.updatePrice(address(syntheticToken), 1e18);

            syntheticToken.initialize({
                name_: "msToken",
                symbol_: "msToken",
                decimals_: 18,
                poolRegistry_: pool.poolRegistry()
            });

            SyntheticTokenHandler syntheticTokenHandler = new SyntheticTokenHandler(syntheticToken);
            bytes4[] memory selectors = new bytes4[](1);
            selectors[0] = SyntheticTokenHandler.transfer.selector;
            targetSelector(FuzzSelector({addr: address(syntheticTokenHandler), selectors: selectors}));
            targetContract(address(syntheticTokenHandler));
            syntheticTokenHandlers.push(syntheticTokenHandler);

            DebtToken debtToken = new DebtToken();
            vm.store(address(debtToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
            debtToken.initialize({
                name_: "msToken-Debt",
                symbol_: "msToken-Debt",
                pool_: pool,
                syntheticToken_: syntheticToken,
                interestRate_: 0,
                maxTotalSupply_: type(uint256).max
            });
            pool.addDebtToken(debtToken);

            DebtTokenHandler debtTokenHandler = new DebtTokenHandler(debtToken);
            bytes4[] memory debtTokenSelectors = new bytes4[](3);
            debtTokenSelectors[0] = DebtTokenHandler.issue.selector;
            debtTokenSelectors[1] = DebtTokenHandler.repay.selector;
            debtTokenSelectors[2] = DebtTokenHandler.updateInterestRate.selector;
            targetSelector(FuzzSelector({addr: address(debtTokenHandler), selectors: debtTokenSelectors}));
            targetContract(address(debtTokenHandler));
            debtTokenHandlers.push(debtTokenHandler);
        }

        accounts.push(address(0x10));
        accounts.push(address(0x11));
        accounts.push(address(0x12));
        accounts.push(address(0x13));
        accounts.push(address(0x14));

        poolHandler = new PoolHandler(pool, accounts);
        targetContract(address(poolHandler));

        feeProviderHandler = new FeeProviderHandler(feeProvider);
        targetContract(address(feeProviderHandler));

        for (uint i; i < accounts.length; ++i) {
            targetSender(accounts[i]);
        }
    }

    // FIXME
    function invariant_debtAndSynthSupply() private {
        address[] memory debtTokens = pool.getDebtTokens();
        uint256 debtsSupplyInUsd;
        uint256 synthsSupplyInUsd;

        for (uint256 i; i < debtTokens.length; ++i) {
            IDebtToken debtToken = IDebtToken(debtTokens[i]);
            ISyntheticToken syntheticToken = debtToken.syntheticToken();

            debtsSupplyInUsd += masterOracle.quoteTokenToUsd(address(syntheticToken), debtToken.totalSupply());
            synthsSupplyInUsd += masterOracle.quoteTokenToUsd(address(syntheticToken), syntheticToken.totalSupply());
        }

        // Note: Assumes no price change along the tests
        assertEq(debtsSupplyInUsd, synthsSupplyInUsd);
    }

    // FIXME
    function invariant_sumOfSynthBalances() private {
        address[] memory debtTokens = pool.getDebtTokens();
        uint256 synthsSupplyInUsd;
        uint256 synthsBalancesInUsd;

        for (uint256 i; i < debtTokens.length; ++i) {
            IDebtToken debtToken = IDebtToken(debtTokens[i]);

            ISyntheticToken syntheticToken = debtToken.syntheticToken();
            synthsSupplyInUsd += masterOracle.quoteTokenToUsd(address(syntheticToken), syntheticToken.totalSupply());

            for (uint256 j; j < accounts.length; ++j) {
                synthsBalancesInUsd += masterOracle.quoteTokenToUsd(
                    address(syntheticToken),
                    syntheticToken.balanceOf(accounts[j])
                );
            }

            synthsBalancesInUsd += masterOracle.quoteTokenToUsd(
                address(syntheticToken),
                syntheticToken.balanceOf(feeCollector)
            );
        }

        // Note: Assumes no price change along the tests
        assertEq(synthsSupplyInUsd, synthsBalancesInUsd);
    }

    function invariant_debtTokensOfAccount() public {
        address[] memory debtTokens = pool.getDebtTokens();

        for (uint i; i < accounts.length; ++i) {
            address account = accounts[i];

            uint count;
            for (uint j; j < debtTokens.length; ++j) {
                if (IDebtToken(debtTokens[j]).balanceOf(account) > 0) ++count;
            }

            assertEq(count, pool.getDebtTokensOfAccount(account).length);
        }
    }

    // FIXME
    function invariant_depositTokensOfAccount() private {
        address[] memory depositTokens = pool.getDepositTokens();

        for (uint i; i < accounts.length; ++i) {
            address account = accounts[i];

            uint count;
            for (uint j; j < depositTokens.length; ++j) {
                if (IDepositToken(depositTokens[j]).balanceOf(account) > 0) ++count;
            }

            assertEq(count, pool.getDepositTokensOfAccount(account).length);
        }
    }

    // FIXME
    function invariant_callSummary() private view {
        poolHandler.callSummary();
        feeProviderHandler.callSummary();
        for (uint256 i; i < depositTokenHandlers.length; ++i) depositTokenHandlers[i].callSummary();
        for (uint256 i; i < syntheticTokenHandlers.length; ++i) syntheticTokenHandlers[i].callSummary();
        for (uint256 i; i < debtTokenHandlers.length; ++i) debtTokenHandlers[i].callSummary();
    }
}
