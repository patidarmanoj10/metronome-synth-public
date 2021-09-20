// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../interface/IMBox.sol";
import "../interface/IDepositToken.sol";

contract MBoxMock is IMBox {
    IDepositToken public depositToken;
    uint256 public lockedCollateral;

    constructor(IDepositToken _depositToken) {
        depositToken = _depositToken;
    }

    function updateLockedCollateral(uint256 _lockedDeposit) external {
        lockedCollateral = _lockedDeposit;
    }

    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _debtInUsd,
            uint256 _debtInUsdWithCollateralization,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        _isHealthy = true;
        _debtInUsd = 0;
        _debtInUsdWithCollateralization = 0;
        _depositInUsd = 0;
        _deposit = depositToken.balanceOf(_account);
        _lockedDeposit = lockedCollateral;
        _unlockedDeposit = _deposit - _lockedDeposit;
    }
}
