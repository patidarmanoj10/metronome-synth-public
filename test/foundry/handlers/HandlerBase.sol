// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {StdAssertions} from "forge-std/StdAssertions.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Vm} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";

contract HandlerBase is StdCheats, StdUtils, StdAssertions {
    mapping(bytes32 => uint256) public calls;

    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal currentActor;
    address[] public actors;

    modifier useActor(uint256 actorIndexSeed) virtual {
        vm.stopPrank();
        if (actors.length == 0) {
            actors.push(msg.sender);
        }
        currentActor = _getRandActor(actorIndexSeed);
        vm.startPrank(currentActor);
        _;
        vm.stopPrank();
    }

    modifier countCall(bytes32 key) {
        calls[key]++;
        _;
    }

    function _getRandActor(uint256 indexSeed) internal view returns (address) {
        return actors[bound(indexSeed, 0, actors.length - 1)];
    }

    function getActors() public view returns (address[] memory) {
        return actors;
    }
}
