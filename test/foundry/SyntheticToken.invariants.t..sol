// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {SyntheticTokenHandler} from "./handlers/SyntheticTokenHandler.sol";
import {PoolRegistry} from "../../contracts/PoolRegistry.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {Pool} from "../../contracts/Pool.sol";
import {MasterOracleMock} from "../../contracts/mock/MasterOracleMock.sol";
import {DebtToken, IDebtToken} from "../../contracts/DebtToken.sol";
import {SyntheticToken} from "../../contracts/SyntheticToken.sol";
import {FeeProvider} from "../../contracts/FeeProvider.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";

contract SyntheticTokenInvariant_Test is Test {
    PoolRegistry poolRegistry;
    SyntheticToken syntheticToken;
    DebtToken debtToken;
    FeeProvider feeProvider;
    Pool pool;
    IESMET esMET = IESMET(address(1)); // won't be called
    MasterOracleMock masterOracle = MasterOracleMock(address(2)); // won't be called
    address feeCollector = address(3); // won't be called
    Treasury treasury = Treasury(address(4)); // won't be called

    SyntheticTokenHandler handler;

    function setUp() public {
        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: masterOracle, feeCollector_: feeCollector});

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: esMET});

        pool = new Pool();
        vm.store(address(pool), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        pool.initialize(poolRegistry);
        pool.updateFeeProvider(feeProvider);
        poolRegistry.registerPool(address(pool));

        syntheticToken = new SyntheticToken();
        vm.store(address(syntheticToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        syntheticToken.initialize({name_: "msUSD", symbol_: "msUSD", decimals_: 18, poolRegistry_: poolRegistry});
        syntheticToken.updateMaxTotalSupply(type(uint64).max);

        debtToken = new DebtToken();
        vm.store(address(debtToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        debtToken.initialize({
            name_: "msUSD-Debt",
            symbol_: "msUSD-Debt",
            pool_: pool,
            syntheticToken_: syntheticToken,
            interestRate_: 0,
            maxTotalSupply_: type(uint64).max
        });

        pool.addDebtToken(debtToken);

        handler = new SyntheticTokenHandler(syntheticToken);

        targetContract(address(handler));
    }

    function invariant_supply() public {
        assertEq(handler.totalMinted() - handler.totalBurnt(), syntheticToken.totalSupply());
    }

    function invariant_sumOfBalances() public {
        uint256 acc = 0;
        address[] memory actors = handler.getActors();
        for (uint i = 0; i < actors.length; ++i) {
            acc += syntheticToken.balanceOf(actors[i]);
        }

        assertEq(acc, syntheticToken.totalSupply());
    }
}
