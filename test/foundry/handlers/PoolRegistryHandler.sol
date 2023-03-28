// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SynthHandlerBase.sol";
import {PoolRegistry} from "../../../contracts/PoolRegistry.sol";

contract PoolRegistryHandler is SynthHandlerBase {
    PoolRegistry poolRegistry;

    uint256 public activePools;
    address[] pools;

    constructor(PoolRegistry poolRegistry_, uint256 set) SynthHandlerBase(IPool(address(0))) {
        poolRegistry = poolRegistry_;

        for (uint160 i = 1; i <= set; ++i) {
            pools.push(address(i));
        }

        governor = poolRegistry.governor();
    }

    function register(uint256 poolIndexSeed) public useGovernor countCall("register") {
        address pool = pools[bound(poolIndexSeed, 0, pools.length - 1)];

        if (!poolRegistry.isPoolRegistered(pool)) {
            activePools++;
        } else {
            vm.expectRevert();
        }

        poolRegistry.registerPool(pool);
    }

    function unregister(uint256 poolIndexSeed) public useGovernor countCall("unregister") {
        address pool = pools[bound(poolIndexSeed, 0, pools.length - 1)];

        if (poolRegistry.isPoolRegistered(pool)) {
            activePools--;
        } else {
            vm.expectRevert();
        }

        poolRegistry.unregisterPool(pool);
    }

    function callSummary() public view {
        console.log("\nPoolRegistryHandler Call Summary\n");
        console.log("register                 ", calls["register"]);
        console.log("unregister               ", calls["unregister"]);
    }
}
