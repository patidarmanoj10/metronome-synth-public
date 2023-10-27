// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {PoolRegistry, IMasterOracle} from "../../contracts/PoolRegistry.sol";

contract PoolRegistryFuzz_Test is TestHelpers {
    using stdStorage for StdStorage;

    PoolRegistry poolRegistry;

    function _setUp() public override {
        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: IMasterOracle(address(1)), feeCollector_: address(2)});
    }

    function testFuzz_registerPool(address pool) public {
        // given
        vm.assume(pool != address(0));
        assertFalse(poolRegistry.isPoolRegistered(pool));
        assertEq(poolRegistry.getPools().length, 0);

        // when
        poolRegistry.registerPool(pool);

        // then
        assertTrue(poolRegistry.isPoolRegistered(pool));
        assertEq(poolRegistry.getPools().length, 1);
        assertEq(poolRegistry.getPools()[0], pool);
        assertEq(poolRegistry.idOfPool(pool), 1);
    }

    function testFuzz_unregisterPool(address pool) public {
        // given
        vm.assume(pool != address(0));
        poolRegistry.registerPool(pool);
        uint256 id = poolRegistry.idOfPool(pool);

        // when
        poolRegistry.unregisterPool(pool);

        // then
        assertEq(poolRegistry.idOfPool(pool), id);
        assertFalse(poolRegistry.isPoolRegistered(pool));
        assertEq(poolRegistry.getPools().length, 0);
    }

    function testFuzz_reregisterPool(address pool) public {
        // given
        vm.assume(pool != address(0));
        poolRegistry.registerPool(pool);
        uint256 id = poolRegistry.idOfPool(pool);
        poolRegistry.unregisterPool(pool);
        assertEq(poolRegistry.idOfPool(pool), id);

        // when
        poolRegistry.registerPool(pool);

        // then
        assertTrue(poolRegistry.isPoolRegistered(pool));
        assertEq(poolRegistry.idOfPool(pool), id);
    }
}
