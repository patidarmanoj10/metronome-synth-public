// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {PoolRegistry} from "contracts/PoolRegistry.sol";
import {Pool} from "contracts/Pool.sol";
import {FeeProvider} from "contracts/FeeProvider.sol";
import {ERC20Mock} from "contracts/mock/ERC20Mock.sol";
import {MasterOracleMock} from "contracts/mock/MasterOracleMock.sol";
import {IESMET} from "contracts/interfaces/external/IESMET.sol";
import {WadRayMath} from "contracts/lib/WadRayMath.sol";

contract Pool_Test is TestHelpers {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;

    ERC20Mock met;
    ERC20Mock esMET;
    ERC20Mock msUSD;
    ERC20Mock msETH;
    PoolRegistry poolRegistry;
    FeeProvider feeProvider;
    Pool pool;
    MasterOracleMock masterOracle;

    function _setUp() public override {
        met = new ERC20Mock("MET", "MET", 18);
        esMET = new ERC20Mock("esMET", "esMET", 18);
        msUSD = new ERC20Mock("msUSD", "msUSD", 18);
        msETH = new ERC20Mock("esETH", "esETH", 18);

        masterOracle = new MasterOracleMock();
        masterOracle.updatePrice(address(met), 1.3e18);
        masterOracle.updatePrice(address(msUSD), 1e18);
        masterOracle.updatePrice(address(msETH), 1000e18);

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: masterOracle, feeCollector_: address(2)});

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});

        pool = new Pool();
        vm.store(address(pool), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        pool.initialize(poolRegistry);
        pool.updateFeeProvider(feeProvider);
    }
}
