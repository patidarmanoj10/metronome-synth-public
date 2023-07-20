// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/ISmartFarmingManager.sol";

// solhint-disable var-name-mixedcase, max-states-count
abstract contract SmartFarmingManagerV1 is ISmartFarmingManager {
    /**
     * @notice L2 Leverage request data
     */
    struct Layer2Leverage {
        IERC20 underlying; // e.g. USDC is vaUSDC's underlying
        IDepositToken depositToken;
        ISyntheticToken syntheticToken;
        uint256 underlyingAmountIn;
        uint256 depositAmountMin;
        uint256 syntheticTokenIssued;
        address account;
        bool finished;
    }

    /**
     * @notice L2 Flash repay request data
     */
    struct Layer2FlashRepay {
        ISyntheticToken syntheticToken;
        uint256 repayAmountMin;
        address account;
        bool finished;
    }

    /**
     * @notice L2 requests' ids counter
     */
    uint256 public layer2RequestId;

    /**
     * @notice L2 leverage requests
     */
    mapping(uint256 => Layer2Leverage) public layer2Leverages;

    /**
     * @notice L2 flash repay requests
     */
    mapping(uint256 => Layer2FlashRepay) public layer2FlashRepays;
}
