// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SynthHandlerBase.sol";
import {Pool, IPool} from "../../../contracts/Pool.sol";
import {SyntheticToken, ISyntheticToken} from "../../../contracts/SyntheticToken.sol";
import {DepositToken, IDepositToken} from "../../../contracts/DepositToken.sol";
import {DebtToken, IDebtToken} from "../../../contracts/DebtToken.sol";
import {ERC20Mock, IERC20} from "../../../contracts/mock/ERC20Mock.sol";

contract PoolHandler is SynthHandlerBase {
    constructor(Pool pool_, address[] memory actors_) SynthHandlerBase(pool_) {
        actors = actors_;
    }

    function increaseTime(uint256 toIncrease) public countCall("increaseTime") {
        toIncrease = bound(toIncrease, 365 days, 10 * 365 days);
        vm.warp(block.timestamp + toIncrease);
    }

    function leverage(uint256 actorSeed) public countCall("leverage") useActor(actorSeed) {
        // TODO
    }

    function swap(
        uint256 actorSeed,
        uint256 synthInSeed,
        uint256 synthOutSeed,
        uint256 amountIn
    ) public countCall("swap") useActor(actorSeed) {
        ISyntheticToken synthIn = _getRandDebtToken(synthInSeed).syntheticToken();
        ISyntheticToken synthOut = _getRandDebtToken(synthOutSeed).syntheticToken();

        amountIn = bound(amountIn, 0, synthIn.balanceOf(currentActor));

        if (amountIn == 0) {
            vm.expectRevert();
        }

        pool.swap(synthIn, synthOut, amountIn);
    }

    function _deposit(address from, IDepositToken _depositToken, uint256 amount) private {
        vm.startPrank(from);
        ERC20Mock underlying = ERC20Mock(address(_depositToken.underlying()));
        underlying.mint(from, amount);
        underlying.approve(address(_depositToken), amount);
        _depositToken.deposit(amount, from);
        vm.stopPrank();
    }

    function liquidate(
        uint256 liquidatorSeed,
        uint256 underwaterSeed
    ) public useActor(liquidatorSeed) countCall("liquidate") {
        // TODO
    }

    function callSummary() public view {
        console.log("\nPoolHandler Call Summary\n");
        console.log("increaseTime                   ", calls["increaseTime"]);
        console.log("leverage                       ", calls["leverage"]);
        console.log("swap                           ", calls["swap"]);
        console.log("liquidate                      ", calls["liquidate"]);
    }

    function _getRandDebtToken(uint256 indexSeed) internal view returns (IDebtToken) {
        address[] memory debtTokens = IPool(pool).getDebtTokens();
        return IDebtToken(debtTokens[bound(indexSeed, 0, debtTokens.length - 1)]);
    }

    function _getRandDepositToken(uint256 indexSeed) internal view returns (IDepositToken) {
        address[] memory depositTokens = IPool(pool).getDepositTokens();
        return IDepositToken(depositTokens[bound(indexSeed, 0, depositTokens.length - 1)]);
    }
}
