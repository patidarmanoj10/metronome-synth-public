// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

/**
 * @notice MBox interface
 * @dev Since the interface isn't enough stable,
 * we'll only have functions that are being called from other contracts for now
 */
interface IMBox {
    function debtPositionOf(address _account)
        external
        view
        returns (
            uint256 _debtInUsd,
            uint256 _collateralInUsd,
            uint256 _collateral,
            uint256 _freeCollateral,
            uint256 _lockedCollateral
        );
}
