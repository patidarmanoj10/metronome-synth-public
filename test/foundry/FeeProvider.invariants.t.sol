// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {FeeProviderHandler} from "./handlers/FeeProviderHandler.sol";
import {PoolRegistry, IMasterOracle} from "../../contracts/PoolRegistry.sol";
import {FeeProvider, FeeProviderStorageV1, TiersNotOrderedByMin} from "../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../contracts/mock/ERC20Mock.sol";
import {IESMET} from "../../contracts/interfaces/external/IESMET.sol";

contract FeeProviderInvariant_Test is Test {
    ERC20Mock esMET;
    PoolRegistry poolRegistry;
    FeeProvider feeProvider;
    FeeProviderHandler handler;

    address public alice = address(1);
    address public bob = address(2);

    function setUp() public {
        esMET = new ERC20Mock("esMET", "esMET", 18);

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: IMasterOracle(address(1)), feeCollector_: address(2)});

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});

        handler = new FeeProviderHandler(feeProvider);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = FeeProviderHandler.setupTiers.selector;
        selectors[1] = FeeProviderHandler.mintESMET.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));

        targetSender(address(alice));
        targetSender(address(bob));

        targetContract(address(handler));
    }

    function invariant_swapFeeDiscount() public {
        uint256 balanceOfAlice = esMET.balanceOf(alice);
        uint256 balanceOfBob = esMET.balanceOf(bob);

        if (balanceOfAlice > balanceOfBob) {
            assertLe(feeProvider.swapFeeFor(alice), feeProvider.swapFeeFor(bob));
        } else if (balanceOfAlice < balanceOfBob) {
            assertGe(feeProvider.swapFeeFor(alice), feeProvider.swapFeeFor(bob));
        } else {
            assertEq(feeProvider.swapFeeFor(alice), feeProvider.swapFeeFor(bob));
        }
    }

    function invariant_callSummary() external view {
        handler.callSummary();
    }
}
