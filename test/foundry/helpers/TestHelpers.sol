// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {Addresses} from "./Addresses.sol";
import {IERC20} from "../../../contracts/dependencies/openzeppelin/token/ERC20/IERC20.sol";

abstract contract TestHelpers is Test, Addresses {
    using stdStorage for StdStorage;

    mapping(address => address) whales;

    constructor() {
        whales[STETH] = 0x41318419CFa25396b47A94896FfA2C77c6434040;
    }

    function deal(address token, address to, uint256 balance) internal override {
        address whale = whales[token];
        if (whale != address(0)) {
            vm.prank(whale);
            IERC20(token).transfer(address(this), balance);
        } else {
            super.deal(token, to, balance);
        }
    }

    function _setUp() public virtual;

    function setUp() public virtual {
        uint256 mainnetFork = vm.createFork(vm.envString("NODE_URL"));
        vm.selectFork(mainnetFork);
        vm.rollFork(mainnetFork, vm.envUint("BLOCK_NUMBER"));

        _setUp();
    }
}
