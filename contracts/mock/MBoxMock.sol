// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "../interface/IMBox.sol";
import "../interface/ICollateral.sol";

contract MBoxMock is IMBox {
    ICollateral public collateral;
    uint256 public lockedCollateral;

    constructor(ICollateral _collateral) {
        collateral = _collateral;
    }

    function updateLockedCollateral(uint256 _lockedCollateral) external {
        lockedCollateral = _lockedCollateral;
    }

    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            uint256 _debtInUsd,
            uint256 _collateralInUsd,
            uint256 _collateral,
            uint256 _freeCollateral,
            uint256 _lockedCollateral
        )
    {
        _debtInUsd = 0;
        _collateralInUsd = 0;
        _collateral = collateral.balanceOf(_account);
        _lockedCollateral = lockedCollateral;
        _freeCollateral = _collateral - _lockedCollateral;
    }
}
