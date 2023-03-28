// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SynthHandlerBase.sol";
import {Math} from "../../../contracts/dependencies/openzeppelin/utils/math/Math.sol";
import {MasterOracleMock} from "../../../contracts/mock/MasterOracleMock.sol";
import {PoolRegistry, IPoolRegistry} from "../../../contracts/PoolRegistry.sol";
import {SyntheticToken} from "../../../contracts/SyntheticToken.sol";
import {ERC20Mock, IERC20} from "../../../contracts/mock/ERC20Mock.sol";

contract SyntheticTokenHandler is SynthHandlerBase {
    SyntheticToken syntheticToken;
    IPoolRegistry poolRegistry;

    uint256 public totalMinted;
    uint256 public totalBurnt;

    constructor(SyntheticToken syntheticToken_) SynthHandlerBase(IPool(syntheticToken_.poolRegistry().getPools()[0])) {
        syntheticToken = syntheticToken_;
        poolRegistry = syntheticToken.poolRegistry();
    }

    function mint(uint256 amount) public useActor(0) usePool countCall("mint") {
        amount = bound(amount, 0, syntheticToken.maxTotalSupply() - syntheticToken.totalSupply());

        syntheticToken.mint(currentActor, amount);

        totalMinted += amount;
    }

    function burn(uint256 amount, uint256 actorSeed) public useActor(actorSeed) usePool countCall("burn") {
        address actor = _getRandActor(actorSeed);

        amount = bound(amount, 0, syntheticToken.balanceOf(actor));

        syntheticToken.burn(actor, amount);

        totalBurnt += amount;
    }

    function approve(
        uint256 actorSeed,
        uint256 spenderSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("approve") {
        address spender = _getRandActor(spenderSeed);

        syntheticToken.approve(spender, amount);
    }

    function increaseAllowance(
        uint256 actorSeed,
        uint256 spenderSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("increaseAllowance") {
        address spender = _getRandActor(spenderSeed);

        amount = bound(amount, 0, type(uint256).max - syntheticToken.allowance(currentActor, spender));

        syntheticToken.increaseAllowance(spender, amount);
    }

    function decreaseAllowance(
        uint256 actorSeed,
        uint256 spenderSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("decreaseAllowance") {
        address spender = _getRandActor(spenderSeed);

        amount = bound(amount, 0, syntheticToken.allowance(currentActor, spender));

        syntheticToken.decreaseAllowance(spender, amount);
    }

    function transfer(
        uint256 actorSeed,
        uint256 toSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("transfer") {
        address to = _getRandActor(toSeed);

        amount = bound(amount, 0, syntheticToken.balanceOf(currentActor));

        syntheticToken.transfer(to, amount);
    }

    function transferFrom(
        uint256 actorSeed,
        uint256 fromSeed,
        uint256 toSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("transferFrom") {
        address from = _getRandActor(fromSeed);
        address to = _getRandActor(toSeed);

        amount = bound(amount, 0, syntheticToken.balanceOf(from));
        amount = bound(amount, 0, syntheticToken.allowance(from, currentActor));

        syntheticToken.transferFrom(from, to, amount);
    }

    function seize(uint256 fromSeed, uint256 toSeed, uint256 amount) public useActor(0) countCall("seize") {
        address from = _getRandActor(fromSeed);
        address to = _getRandActor(toSeed);

        amount = bound(amount, 0, syntheticToken.balanceOf(from));

        vm.stopPrank();
        vm.prank(address(pool));
        syntheticToken.seize(from, to, amount);
    }

    function callSummary() public view {
        console.log("\nSyntheticTokenHandler Call Summary\n");
        console.log("mint                   ", calls["mint"]);
        console.log("burn                   ", calls["burn"]);
        console.log("approve                ", calls["approve"]);
        console.log("increaseAllowance      ", calls["increaseAllowance"]);
        console.log("decreaseAllowance      ", calls["decreaseAllowance"]);
        console.log("transfer               ", calls["transfer"]);
        console.log("transferFrom           ", calls["transferFrom"]);
        console.log("seize                  ", calls["seize"]);
    }
}
