// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {PoolRegistry, IMasterOracle} from "../../contracts/PoolRegistry.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";
import {WadRayMath} from "../../contracts/lib/WadRayMath.sol";

contract FeeProviderFuzz_Test is TestHelpers {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;

    PoolRegistry poolRegistry;
    FeeProvider feeProvider;
    ERC20Mock esMET;

    function _setUp() public override {
        esMET = new ERC20Mock("esMET", "esMET", 18);

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: IMasterOracle(address(1)), feeCollector_: address(2)});

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});
    }

    function testFuzz_updateTiers(uint64 tier0Min, uint64 tier0Discount, uint8 tiers) public {
        vm.assume(tier0Discount < 0.1e18);
        vm.assume(tiers > 0 && tiers < 5);

        FeeProviderStorageV1.Tier[] memory tiersArray = new FeeProviderStorageV1.Tier[](tiers);

        for (uint256 i; i < tiers; ++i) {
            uint128 min = uint128(tier0Min * (1 + i));
            uint128 discount = uint128(tier0Discount * (1 + i));
            tiersArray[i] = FeeProviderStorageV1.Tier({min: min, discount: discount});
        }

        assertEq(feeProvider.getTiers().length, 0);
        feeProvider.updateTiers(tiersArray);
        assertEq(feeProvider.getTiers().length, tiers);
    }

    // Note: It's very unlikely that fuzz will push min array ordered
    function testFuzz_updateTiers_revertIf_notOrdered(uint64[10] memory min, uint32[10] memory discount) public {
        FeeProviderStorageV1.Tier[] memory tiers = new FeeProviderStorageV1.Tier[](10);
        for (uint256 i; i < 10; ++i) {
            tiers[i] = FeeProviderStorageV1.Tier({min: min[i], discount: discount[i]});
        }

        vm.expectRevert(TiersNotOrderedByMin.selector);
        feeProvider.updateTiers(tiers);
    }

    function test_swapFeeFor(uint16 balance) public {
        vm.assume(balance < 50e3);

        address user = address(123);
        esMET.mint(user, balance);
        uint256 defaultSwapFee = feeProvider.defaultSwapFee();

        FeeProviderStorageV1.Tier[] memory tiers = new FeeProviderStorageV1.Tier[](3);
        tiers[0] = FeeProviderStorageV1.Tier({min: 10e3, discount: 0.1e18});
        tiers[1] = FeeProviderStorageV1.Tier({min: 20e3, discount: 0.2e18});
        tiers[2] = FeeProviderStorageV1.Tier({min: 30e3, discount: 0.3e18});
        feeProvider.updateTiers(tiers);

        if (balance < tiers[0].min) {
            assertEq(feeProvider.swapFeeFor(user), defaultSwapFee);
        } else if (tiers[0].min <= balance && balance < tiers[1].min) {
            assertEq(feeProvider.swapFeeFor(user), defaultSwapFee.wadMul(1e18 - tiers[0].discount));
        } else if (tiers[1].min <= balance && balance < tiers[2].min) {
            assertEq(feeProvider.swapFeeFor(user), defaultSwapFee.wadMul(1e18 - tiers[1].discount));
        } else {
            assertEq(feeProvider.swapFeeFor(user), defaultSwapFee.wadMul(1e18 - tiers[2].discount));
        }
    }
}
