// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IGovernable.sol";

/**
 * @notice FeeProvider interface
 */
interface IFeeProvider is IGovernable {
    struct LiquidationFees {
        uint128 liquidatorIncentive;
        uint128 protocolFee;
    }

    function depositFee() external view returns (uint256);

    function issueFee() external view returns (uint256);

    function liquidationFees() external view returns (uint128 liquidatorIncentive, uint128 protocolFee);

    function repayFee() external view returns (uint256);

    function swapFee() external view returns (uint256);

    function withdrawFee() external view returns (uint256);

    function updateDepositFee(uint256 newDepositFee_) external;

    function updateIssueFee(uint256 newIssueFee_) external;

    function updateLiquidatorIncentive(uint128 newLiquidatorIncentive_) external;

    function updateProtocolLiquidationFee(uint128 newProtocolLiquidationFee_) external;

    function updateSwapFee(uint256 newSwapFee_) external;

    function updateRepayFee(uint256 newRepayFee_) external;

    function updateWithdrawFee(uint256 newWithdrawFee_) external;
}
