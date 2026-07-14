// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {PoolRegistry, IMasterOracle} from "contracts/PoolRegistry.sol";
import {FeeProvider, FeeIsGreaterThanTheMax, NewValueIsSameAsCurrent, SenderIsNotGovernor} from "contracts/FeeProvider.sol";
import {ERC20Mock} from "contracts/mock/ERC20Mock.sol";
import {IESMET} from "contracts/interfaces/external/IESMET.sol";

contract FeeProviderFuzz_Test is TestHelpers {
    uint256 internal constant MAX_FEE_VALUE = 0.25e18;

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

    function testFuzz_swapFees_defaultsToZero(address synthIn, address synthOut) public {
        assertEq(feeProvider.swapFees(synthIn, synthOut), 0);
    }

    function testFuzz_updateSwapFees(address synthIn, address synthOut, uint256 fee) public {
        fee = bound(fee, 1, MAX_FEE_VALUE);

        feeProvider.updateSwapFee(synthIn, synthOut, fee);

        assertEq(feeProvider.swapFees(synthIn, synthOut), fee);
        assertEq(feeProvider.swapFees(synthIn, synthOut), fee);
    }

    // Note: The fee is keyed by direction, so setting `synthIn => synthOut` must not affect `synthOut => synthIn`
    function testFuzz_updateSwapFees_isDirectional(address synthIn, address synthOut, uint256 fee) public {
        vm.assume(synthIn != synthOut);
        fee = bound(fee, 1, MAX_FEE_VALUE);

        feeProvider.updateSwapFee(synthIn, synthOut, fee);

        assertEq(feeProvider.swapFees(synthOut, synthIn), 0);
    }

    function testFuzz_updateSwapFees_revertIf_greaterThanMax(address synthIn, address synthOut, uint256 fee) public {
        fee = bound(fee, MAX_FEE_VALUE + 1, type(uint256).max);

        vm.expectRevert(FeeIsGreaterThanTheMax.selector);
        feeProvider.updateSwapFee(synthIn, synthOut, fee);
    }

    function testFuzz_updateSwapFees_revertIf_sameAsCurrent(address synthIn, address synthOut, uint256 fee) public {
        fee = bound(fee, 1, MAX_FEE_VALUE);
        feeProvider.updateSwapFee(synthIn, synthOut, fee);

        vm.expectRevert(NewValueIsSameAsCurrent.selector);
        feeProvider.updateSwapFee(synthIn, synthOut, fee);
    }

    function testFuzz_updateSwapFees_revertIf_notGovernor(address caller) public {
        vm.assume(caller != address(this));

        vm.prank(caller);
        vm.expectRevert(SenderIsNotGovernor.selector);
        feeProvider.updateSwapFee(address(1), address(2), 1e16);
    }
}
