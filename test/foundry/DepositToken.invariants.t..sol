// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {DepositTokenHandler} from "./handlers/DepositTokenHandler.sol";
import {FeeProviderHandler} from "./handlers/FeeProviderHandler.sol";
import {PoolRegistry, IMasterOracle} from "../../contracts/PoolRegistry.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {Pool} from "../../contracts/Pool.sol";
import {MasterOracleMock} from "../../contracts/mock/MasterOracleMock.sol";
import {DepositToken} from "../../contracts/DepositToken.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";

contract DepositTokenInvariant_Test is Test {
    PoolRegistry poolRegistry;
    ERC20Mock underlying;
    DepositToken depositToken;
    ERC20Mock esMET;
    FeeProvider feeProvider;
    Pool pool;
    MasterOracleMock masterOracle;
    Treasury treasury;
    address feeCollector = address(2);

    DepositTokenHandler depositTokenHandler;
    FeeProviderHandler feeProviderHandler;

    function setUp() public {
        underlying = new ERC20Mock("dai", "dai", 18);
        esMET = new ERC20Mock("esMET", "esMET", 18);

        masterOracle = new MasterOracleMock();
        masterOracle.updatePrice(address(underlying), 1e18);

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: masterOracle, feeCollector_: feeCollector});

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});

        pool = new Pool();
        vm.store(address(pool), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        pool.initialize(poolRegistry);
        pool.updateFeeProvider(feeProvider);

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

        treasury = new Treasury();
        vm.store(address(treasury), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        treasury.initialize(pool);

        pool.updateTreasury(treasury);
        pool.addDepositToken(address(depositToken));

        depositTokenHandler = new DepositTokenHandler(depositToken);
        feeProviderHandler = new FeeProviderHandler(feeProvider);

        bytes4[] memory feeProviderSelectors = new bytes4[](2);
        feeProviderSelectors[0] = FeeProviderHandler.updateDepositFee.selector;
        feeProviderSelectors[1] = FeeProviderHandler.updateWithdrawFee.selector;
        targetSelector(FuzzSelector({addr: address(feeProviderHandler), selectors: feeProviderSelectors}));

        targetContract(address(depositTokenHandler));
        // Note: Avoiding have `feeColletor` be counted twice on `invariant_sumOfBalances`
        excludeSender(feeCollector);
    }

    function invariant_nothingLocked() public {
        assertEq(depositTokenHandler.lockedAccumulator(), 0);
        assertEq(depositToken.lockedBalanceOf(feeCollector), 0);
    }

    function invariant_supply() public {
        assertEq(depositTokenHandler.totalMinted() - depositTokenHandler.totalBurnt(), depositToken.totalSupply());
    }

    function invariant_treasuryBalance() public {
        assertEq(depositToken.totalSupply(), underlying.balanceOf(address(treasury)));
    }

    function invariant_sumOfBalances() public {
        uint256 acc = depositToken.balanceOf(address(feeCollector));
        address[] memory actors = depositTokenHandler.getActors();
        for (uint i = 0; i < actors.length; ++i) {
            acc += depositToken.balanceOf(actors[i]);
        }

        assertEq(acc, depositToken.totalSupply());
    }

    function invariant_depositTokenCallSummary() external view {
        depositTokenHandler.callSummary();
    }

    function invariant_feeProviderCallSummary() external view {
        feeProviderHandler.callSummary();
    }
}
