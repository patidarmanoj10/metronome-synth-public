// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

/**
 * @notice MBox interface
 * @dev Since the interface isn't enough stable,
 * we'll only have functions that are being called from other contracts for now
 * @dev Check if we expose return var with `_` prefix
 */
interface IMBox {
    function debtPositionOf(address _account)
        external
        view
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        );
}
