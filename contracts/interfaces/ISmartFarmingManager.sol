// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IERC20} from "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {IDepositToken} from "./IDepositToken.sol";
import {ISyntheticToken} from "./ISyntheticToken.sol";

/**
 * @notice SmartFarmingManager interface
 */
interface ISmartFarmingManager {
    function flashRepay(
        ISyntheticToken syntheticToken_,
        IDepositToken depositToken_,
        uint256 withdrawAmount_,
        uint256 repayAmountMin_
    ) external returns (uint256 _withdrawn, uint256 _repaid);

    function leverage(
        IERC20 tokenIn_,
        IDepositToken depositToken_,
        ISyntheticToken syntheticToken_,
        uint256 amountIn_,
        uint256 leverage_,
        uint256 depositAmountMin_
    ) external returns (uint256 _deposited, uint256 _issued);
}
