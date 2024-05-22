// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SynthHandlerBase.sol";
import {Math} from "../../../contracts/dependencies/openzeppelin/utils/math/Math.sol";
import {Pool, IPool} from "../../../contracts/Pool.sol";
import {PoolRegistry, IPoolRegistry} from "../../../contracts/PoolRegistry.sol";
import {DebtToken} from "../../../contracts/DebtToken.sol";
import {ISyntheticToken} from "../../../contracts/SyntheticToken.sol";
import {ERC20Mock, IERC20} from "../../../contracts/mock/ERC20Mock.sol";

contract DebtTokenHandler is SynthHandlerBase {
    DebtToken debtToken;
    IPoolRegistry poolRegistry;
    ISyntheticToken syntheticToken;

    constructor(DebtToken debtToken_) SynthHandlerBase(debtToken_.pool()) {
        debtToken = debtToken_;
        poolRegistry = pool.poolRegistry();
        syntheticToken = debtToken.syntheticToken();
    }

    function accrueInterest() public countCall("accrueInterest") {
        debtToken.accrueInterest();
    }

    function updateInterestRate(uint256 ir) public useGovernor countCall("updateInterestRate") {
        ir = bound(ir, 1, 3e18);

        if (ir == debtToken.interestRate()) {
            vm.expectRevert();
        }

        debtToken.updateInterestRate(ir);
    }

    function increaseTime(uint256 toIncrease) public countCall("increaseTime") {
        toIncrease = bound(toIncrease, 0, 365 days);
        vm.warp(block.timestamp + toIncrease);
    }

    function issue(uint256 amount, uint256 actorSeed) public useActor(actorSeed) countCall("issue") {
        (, , , , uint256 issuableInUsd) = pool.debtPositionOf(currentActor);
        uint256 max = poolRegistry.masterOracle().quoteUsdToToken(address(syntheticToken), issuableInUsd);

        amount = bound(amount, 0, max);

        if (amount == 0) {
            vm.expectRevert();
        }

        debtToken.issue(amount, currentActor);
    }

    function repay(uint256 amount, uint256 actorSeed) public useActor(actorSeed) countCall("repay") {
        amount = bound(amount, 0, Math.min(syntheticToken.balanceOf(currentActor), debtToken.balanceOf(currentActor)));

        if (amount == 0) {
            vm.expectRevert();
        }

        debtToken.repay(currentActor, amount);
    }

    function repayAll(uint256 actorSeed) public useActor(actorSeed) countCall("repayAll") {
        uint256 debt = debtToken.balanceOf(currentActor);
        uint256 synth = syntheticToken.balanceOf(currentActor);

        if (synth > debt) {
            debtToken.repayAll(currentActor);
        } else {
            uint256 amount = Math.min(synth, debt);
            if (amount == 0) {
                vm.expectRevert();
            }
            debtToken.repay(currentActor, amount);
        }
    }

    function callSummary() public view {
        console.log("\nDebtTokenHandler Call Summary\n");
        console.log("accrueInterest            ", calls["accrueInterest"]);
        console.log("updateInterestRate        ", calls["updateInterestRate"]);
        console.log("increaseTime              ", calls["increaseTime"]);
        console.log("issue                     ", calls["issue"]);
        console.log("repay                     ", calls["repay"]);
        console.log("repayAll                  ", calls["repayAll"]);
    }
}
