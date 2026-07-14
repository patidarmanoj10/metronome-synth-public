// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import "./SynthHandlerBase.sol";
import {FeeProvider} from "contracts/FeeProvider.sol";

contract FeeProviderHandler is SynthHandlerBase {
    FeeProvider feeProvider;

    // Synth addresses used as swap-fee pair keys (`synthIn` => `synthOut`)
    address[] internal synths;

    constructor(FeeProvider feeProvider_) SynthHandlerBase(IPool(address(0))) {
        feeProvider = feeProvider_;
        governor = feeProvider_.poolRegistry().governor();

        synths.push(address(0x51));
        synths.push(address(0x52));
        synths.push(address(0x53));
    }

    function getSynths() external view returns (address[] memory) {
        return synths;
    }

    function _synthPair(uint256 inSeed_, uint256 outSeed_) internal view returns (address synthIn, address synthOut) {
        synthIn = synths[bound(inSeed_, 0, synths.length - 1)];
        synthOut = synths[bound(outSeed_, 0, synths.length - 1)];
    }

    function updateSwapFee(uint256 inSeed, uint256 outSeed, uint256 fee) public useGovernor countCall("updateSwapFee") {
        (address synthIn, address synthOut) = _synthPair(inSeed, outSeed);
        fee = bound(fee, 0.001e18, MAX_FEE);

        if (fee == feeProvider.swapFees(synthIn, synthOut)) {
            vm.expectRevert();
        }

        feeProvider.updateSwapFee(synthIn, synthOut, fee);
    }

    function updateDepositFee(uint256 fee) public useGovernor countCall("updateDepositFee") {
        fee = bound(fee, 0.001e18, MAX_FEE);

        if (fee == feeProvider.depositFee()) {
            vm.expectRevert();
        }

        feeProvider.updateDepositFee(fee);
    }

    function updateWithdrawFee(uint256 fee) public useGovernor countCall("updateWithdrawFee") {
        fee = bound(fee, 0.001e18, MAX_FEE);

        if (fee == feeProvider.withdrawFee()) {
            vm.expectRevert();
        }

        feeProvider.updateWithdrawFee(fee);
    }

    function updateIssueFee(uint256 fee) public useGovernor countCall("updateIssueFee") {
        fee = bound(fee, 0.001e18, MAX_FEE);

        if (fee == feeProvider.issueFee()) {
            vm.expectRevert();
        }

        feeProvider.updateIssueFee(fee);
    }

    function updateRepayFee(uint256 fee) public useGovernor countCall("updateRepayFee") {
        fee = bound(fee, 0.001e18, MAX_FEE);

        if (fee == feeProvider.repayFee()) {
            vm.expectRevert();
        }

        feeProvider.updateRepayFee(fee);
    }

    function updateLiquidatorIncentive(uint128 fee) public useGovernor countCall("updateLiquidatorIncentive") {
        (uint128 liquidatorIncentive, uint128 protocolFee) = feeProvider.liquidationFees();
        fee = uint128(bound(fee, 0.001e18, MAX_FEE - protocolFee));

        if (fee == liquidatorIncentive) {
            vm.expectRevert();
        }

        feeProvider.updateLiquidatorIncentive(fee);
    }

    function updateProtocolLiquidationFee(uint128 fee) public useGovernor countCall("updateProtocolLiquidationFee") {
        (uint128 liquidatorIncentive, uint128 protocolFee) = feeProvider.liquidationFees();
        fee = uint128(bound(fee, 0.001e18, MAX_FEE - liquidatorIncentive));

        if (fee == protocolFee) {
            vm.expectRevert();
        }

        feeProvider.updateProtocolLiquidationFee(fee);
    }

    function callSummary() public view {
        console.log("\nFeeProviderHandler Call Summary\n");
        console.log("updateSwapFee          ", calls["updateSwapFee"]);
        console.log("updateDepositFee               ", calls["updateDepositFee"]);
        console.log("updateWithdrawFee              ", calls["updateWithdrawFee"]);
        console.log("updateIssueFee                 ", calls["updateIssueFee"]);
        console.log("updateRepayFee                 ", calls["updateRepayFee"]);
        console.log("updateLiquidatorIncentive      ", calls["updateLiquidatorIncentive"]);
        console.log("updateProtocolLiquidationFee   ", calls["updateProtocolLiquidationFee"]);
    }
}
