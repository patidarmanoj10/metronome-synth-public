// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {PoolRegistryHandler} from "./handlers/PoolRegistryHandler.sol";
import {PoolRegistry, IMasterOracle} from "../../contracts/PoolRegistry.sol";

contract PoolRegistryInvariant_Test is Test {
    PoolRegistry poolRegistry;
    PoolRegistryHandler handler;

    uint256 constant POOLS_SET = 5;

    function setUp() public {
        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: IMasterOracle(address(1)), feeCollector_: address(2)});

        handler = new PoolRegistryHandler(poolRegistry, POOLS_SET);

        targetContract(address(handler));
    }

    function invariant_activePools() public {
        assertEq(poolRegistry.getPools().length, handler.activePools());
    }

    function invariant_ids() public {
        assertLe(poolRegistry.nextPoolId(), POOLS_SET + 1);
    }
}
