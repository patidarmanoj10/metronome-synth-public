// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {FeeProviderHandler} from "./handlers/FeeProviderHandler.sol";
import {PoolRegistry, IMasterOracle} from "contracts/PoolRegistry.sol";
import {ERC20Mock} from "contracts/mock/ERC20Mock.sol";
import {IESMET} from "contracts/interfaces/external/IESMET.sol";
import {FeeProvider} from "contracts/FeeProvider.sol";

contract FeeProviderInvariant_Test is Test {
    uint256 internal constant MAX_FEE_VALUE = 0.25e18;

    ERC20Mock esMET;
    PoolRegistry poolRegistry;
    FeeProvider feeProvider;
    FeeProviderHandler handler;

    function setUp() public {
        esMET = new ERC20Mock("esMET", "esMET", 18);

        poolRegistry = new PoolRegistry();
        vm.store(address(poolRegistry), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        poolRegistry.initialize({masterOracle_: IMasterOracle(address(1)), feeCollector_: address(2)});

        feeProvider = new FeeProvider();
        vm.store(address(feeProvider), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        feeProvider.initialize({poolRegistry_: poolRegistry, esMET_: IESMET(address(esMET))});

        handler = new FeeProviderHandler(feeProvider);

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = FeeProviderHandler.updateSwapFee.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));

        targetContract(address(handler));
    }

    /// @dev A swap fee can never be set above the protocol max, in any direction.
    function invariant_swapFeeNeverExceedsMax() public view {
        address[] memory synths = handler.getSynths();

        for (uint256 i; i < synths.length; ++i) {
            for (uint256 j; j < synths.length; ++j) {
                assertLe(feeProvider.swapFees(synths[i], synths[j]), MAX_FEE_VALUE);
            }
        }
    }

    function invariant_callSummary() external view {
        handler.callSummary();
    }
}
