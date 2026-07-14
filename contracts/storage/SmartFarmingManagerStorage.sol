// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IERC20} from "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {ISmartFarmingManager} from "../interfaces/ISmartFarmingManager.sol";
import {IDepositToken} from "../interfaces/IDepositToken.sol";
import {ISyntheticToken} from "../interfaces/ISyntheticToken.sol";

// solhint-disable var-name-mixedcase, max-states-count
abstract contract SmartFarmingManagerStorageV1 is ISmartFarmingManager {
    struct CrossChainLeverage {
        uint16 dstChainId;
        IERC20 bridgeToken;
        IDepositToken depositToken;
        ISyntheticToken syntheticToken;
        uint256 amountIn;
        uint256 debtAmount;
        uint256 depositAmountMin;
        address account;
        bool finished;
        IERC20 tokenIn;
    }

    struct CrossChainFlashRepay {
        uint16 dstChainId;
        ISyntheticToken syntheticToken;
        uint256 repayAmountMin;
        address account;
        bool finished;
    }

    uint256 private crossChainRequestsLength__DEPRECATED;

    mapping(uint256 => CrossChainLeverage) private crossChainLeverages__DEPRECATED;

    mapping(uint256 => CrossChainFlashRepay) private crossChainFlashRepays__DEPRECATED;
}
