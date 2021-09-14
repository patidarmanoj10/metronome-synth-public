// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "../interface/IMBox.sol";
import "../interface/IDepositToken.sol";

contract MBoxMock is IMBox {
    IDepositToken public depositToken;
    uint256 public lockedCollateral;

    constructor(IDepositToken _depositToken) {
        depositToken = _depositToken;
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
        _collateral = depositToken.balanceOf(_account);
        _lockedCollateral = lockedCollateral;
        _freeCollateral = _collateral - _lockedCollateral;
    }
}
