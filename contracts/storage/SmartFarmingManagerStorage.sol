// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import "../lib/MappedEnumerableSet.sol";
import "../interfaces/ISmartFarmingManager.sol";

// solhint-disable var-name-mixedcase, max-states-count
abstract contract SmartFarmingManagerV1 is ISmartFarmingManager {
    /**
     * @notice Swapper contract
     */
    ISwapper public swapper;

    // TODO: Comment
    // TODO: Move to `IPool` ?
    struct Layer2Leverage {
        IERC20 underlying;
        IDepositToken depositToken;
        ISyntheticToken syntheticToken;
        uint256 tokenInAmountIn;
        uint256 depositAmountMin;
        uint256 syntheticTokenIssued;
        uint256 collateralDeposited;
        address account;
        bool finished;
    }

    // TODO: Comment
    // TODO: Move to `IPool` ?
    struct Layer2FlashRepay {
        ISyntheticToken syntheticToken;
        IDepositToken depositToken;
        uint256 withdrawAmount;
        IERC20 underlying;
        uint256 repayAmountMin;
        uint256 debtRepaid;
        address account;
        bool finished;
    }

    // TODO: Comment
    uint256 public layer2RequestId;

    // TODO: Comment
    mapping(uint256 => Layer2Leverage) public layer2Leverages;

    // TODO: Comment
    mapping(uint256 => Layer2FlashRepay) public layer2FlashRepays;
}
