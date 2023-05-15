// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SynthHandlerBase.sol";
import {Math} from "../../../contracts/dependencies/openzeppelin/utils/math/Math.sol";
import {DepositToken} from "../../../contracts/DepositToken.sol";
import {ERC20Mock, IERC20} from "../../../contracts/mock/ERC20Mock.sol";

contract DepositTokenHandler is SynthHandlerBase {
    uint256 internal constant MAX_CR = 1e18;

    DepositToken depositToken;

    uint256 public lockedAccumulator;
    uint256 public totalMinted;
    uint256 public totalBurnt;

    constructor(DepositToken depositToken_) SynthHandlerBase(depositToken_.pool()) {
        depositToken = depositToken_;
        governor = depositToken.pool().poolRegistry().governor();
    }

    function updatePrice(uint256 price) public countCall("updatePrice") {
        super.updatePrice(address(depositToken.underlying()), price);
    }

    function updateCollateralFactor(uint128 cr) public useGovernor countCall("updateCollateralFactor") {
        cr = uint128(bound(cr, 0.1e18, MAX_CR));

        if (cr == depositToken.collateralFactor()) {
            vm.expectRevert();
        }

        depositToken.updateCollateralFactor(cr);
    }

    function deposit(uint256 amount) public useActor(0) countCall("deposit") {
        amount = bound(amount, 0, DEFAULT_AMOUNT);

        if (amount == 0) {
            vm.expectRevert();
            depositToken.deposit(amount, currentActor);
            return;
        }

        ERC20Mock underlying = ERC20Mock(address(depositToken.underlying()));
        underlying.mint(currentActor, amount);
        underlying.approve(address(depositToken), amount);
        depositToken.deposit(amount, currentActor);

        lockedAccumulator += depositToken.lockedBalanceOf(currentActor);
        totalMinted += amount;
    }

    function withdraw(uint256 amount, uint256 actorSeed) public useActor(actorSeed) countCall("withdraw") {
        amount = bound(amount, 0, depositToken.unlockedBalanceOf(currentActor));

        if (amount == 0) {
            vm.expectRevert();
            depositToken.withdraw(amount, currentActor);
            return;
        }

        (uint256 withdrawn, ) = depositToken.withdraw(amount, currentActor);

        totalBurnt += withdrawn;
    }

    function approve(
        uint256 actorSeed,
        uint256 spenderSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("approve") {
        address spender = _getRandActor(spenderSeed);

        depositToken.approve(spender, amount);
    }

    function increaseAllowance(
        uint256 actorSeed,
        uint256 spenderSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("increaseAllowance") {
        address spender = _getRandActor(spenderSeed);

        amount = bound(amount, 0, type(uint256).max - depositToken.allowance(currentActor, spender));

        depositToken.increaseAllowance(spender, amount);
    }

    function decreaseAllowance(
        uint256 actorSeed,
        uint256 spenderSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("decreaseAllowance") {
        address spender = _getRandActor(spenderSeed);

        amount = bound(amount, 0, depositToken.allowance(currentActor, spender));

        depositToken.decreaseAllowance(spender, amount);
    }

    function transfer(
        uint256 actorSeed,
        uint256 toSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("transfer") {
        address to = _getRandActor(toSeed);

        amount = bound(amount, 0, depositToken.unlockedBalanceOf(currentActor));

        depositToken.transfer(to, amount);
    }

    function transferFrom(
        uint256 actorSeed,
        uint256 fromSeed,
        uint256 toSeed,
        uint256 amount
    ) public useActor(actorSeed) countCall("transferFrom") {
        address from = _getRandActor(fromSeed);
        address to = _getRandActor(toSeed);

        amount = bound(amount, 0, depositToken.balanceOf(from));
        amount = bound(amount, 0, depositToken.allowance(from, currentActor));

        depositToken.transferFrom(from, to, amount);
    }

    function seize(uint256 fromSeed, uint256 toSeed, uint256 amount) public useActor(0) countCall("seize") {
        address from = _getRandActor(fromSeed);
        address to = _getRandActor(toSeed);

        amount = bound(amount, 0, depositToken.balanceOf(from));

        vm.stopPrank();
        vm.startPrank(address(depositToken.pool()));
        depositToken.seize(from, to, amount);
    }

    function callSummary() public view {
        console.log("\nDepositTokenHandler Call Summary\n");
        console.log("updatePrice                    ", calls["updatePrice"]);
        console.log("updateCollateralFactor         ", calls["updateCollateralFactor"]);
        console.log("deposit                        ", calls["deposit"]);
        console.log("withdraw                       ", calls["withdraw"]);
        console.log("approve                        ", calls["approve"]);
        console.log("increaseAllowance              ", calls["increaseAllowance"]);
        console.log("decreaseAllowance              ", calls["decreaseAllowance"]);
        console.log("transfer                       ", calls["transfer"]);
        console.log("transferFrom                   ", calls["transferFrom"]);
        console.log("seize                          ", calls["seize"]);
    }
}
