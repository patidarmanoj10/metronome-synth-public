// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {PoolRegistry} from "../../contracts/PoolRegistry.sol";
import {Pool, ISyntheticToken} from "../../contracts/Pool.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {MasterOracleMock} from "../../contracts/mock/MasterOracleMock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";
import {WadRayMath} from "../../contracts/lib/WadRayMath.sol";

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
        poolRegistry.initialize({masterOracle_: masterOracle, feeCollector_: address(2)});

        feeProvider = new FeeProvider();
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});
        FeeProviderStorageV1.Tier[] memory tiers = new FeeProviderStorageV1.Tier[](4);
        tiers[0] = FeeProviderStorageV1.Tier({min: 500e18, discount: 0.2e18});
        tiers[1] = FeeProviderStorageV1.Tier({min: 5000e18, discount: 0.4e18});
        tiers[2] = FeeProviderStorageV1.Tier({min: 50000e18, discount: 0.6e18});
        tiers[3] = FeeProviderStorageV1.Tier({min: 500000e18, discount: 0.8e18});
        feeProvider.updateTiers(tiers);

        pool = new Pool();
        pool.initialize(poolRegistry);
        pool.updateFeeProvider(feeProvider);
    }
}
