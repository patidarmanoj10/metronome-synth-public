// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SynthHandlerBase.sol";
import {FeeProvider, FeeProviderStorageV1} from "../../../contracts/FeeProvider.sol";
import {ERC20Mock} from "../../../contracts/mock/ERC20Mock.sol";

contract FeeProviderHandler is SynthHandlerBase {
    FeeProvider feeProvider;

    constructor(FeeProvider feeProvider_) SynthHandlerBase(IPool(address(0))) {
        feeProvider = feeProvider_;
        governor = feeProvider_.poolRegistry().governor();
    }

    function setupTiers(uint128 min0, uint128 min1) public countCall("setupTiers") {
        vm.prank(feeProvider.poolRegistry().governor());

        uint256 half = type(uint128).max / 2;
        min0 = uint128(bound(min0, 0, half));
        min1 = uint128(bound(min1, half + 1, type(uint128).max));

        vm.assume(min0 < min1);
        FeeProviderStorageV1.Tier[] memory tiersArray = new FeeProviderStorageV1.Tier[](2);
        tiersArray[0] = FeeProviderStorageV1.Tier({min: min0, discount: 0.1e18});
        tiersArray[1] = FeeProviderStorageV1.Tier({min: min1, discount: 0.2e18});
        feeProvider.updateTiers(tiersArray);
    }

    function mintESMET(uint128 balance) public countCall("mintESMET") {
        ERC20Mock esMET = ERC20Mock(address(feeProvider.esMET()));
        esMET.mint(msg.sender, balance);
    }

    function updateDefaultSwapFee(uint256 fee) public useGovernor countCall("updateDefaultSwapFee") {
        fee = bound(fee, 0.001e18, MAX_FEE);

        if (fee == feeProvider.defaultSwapFee()) {
            vm.expectRevert();
        }

        feeProvider.updateDefaultSwapFee(fee);
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
        fee = uint128(bound(fee, 0.001e18, MAX_FEE));

        (uint128 liquidatorIncentive, ) = feeProvider.liquidationFees();
        if (fee == liquidatorIncentive) {
            vm.expectRevert();
        }

        feeProvider.updateLiquidatorIncentive(fee);
    }

    function updateProtocolLiquidationFee(uint128 fee) public useGovernor countCall("updateProtocolLiquidationFee") {
        fee = uint128(bound(fee, 0.001e18, MAX_FEE));

        (, uint128 protocolFee) = feeProvider.liquidationFees();
        if (fee == protocolFee) {
            vm.expectRevert();
        }

        feeProvider.updateProtocolLiquidationFee(fee);
    }

    function callSummary() public view {
        console.log("\nFeeProviderHandler Call Summary\n");
        console.log("setupTiers                     ", calls["setupTiers"]);
        console.log("mintESMET                      ", calls["mintESMET"]);
        console.log("updateDefaultSwapFee           ", calls["updateDefaultSwapFee"]);
        console.log("updateDepositFee               ", calls["updateDepositFee"]);
        console.log("updateWithdrawFee              ", calls["updateWithdrawFee"]);
        console.log("updateIssueFee                 ", calls["updateIssueFee"]);
        console.log("updateRepayFee                 ", calls["updateRepayFee"]);
        console.log("updateLiquidatorIncentive      ", calls["updateLiquidatorIncentive"]);
        console.log("updateProtocolLiquidationFee   ", calls["updateProtocolLiquidationFee"]);
    }
}
