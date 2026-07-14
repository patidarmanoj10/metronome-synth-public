// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

/**
 * @notice FeeProvider interface
 */
interface IFeeProvider {
    struct LiquidationFees {
        uint128 liquidatorIncentive;
        uint128 protocolFee;
    }

    function swapFees(address synthIn, address synthOut) external view returns (uint256);

    function depositFee() external view returns (uint256);

    function issueFee() external view returns (uint256);

    function liquidationFees() external view returns (uint128 liquidatorIncentive, uint128 protocolFee);

    function repayFee() external view returns (uint256);

    function withdrawFee() external view returns (uint256);
}
