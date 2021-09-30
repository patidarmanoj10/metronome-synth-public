// SPDX-License-Identifier: MIT

pragma solidity 0.8.8;

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
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        _isHealthy = true;
        _debtInUsd = 0;
        _lockedDepositInUsd = 0;
        _depositInUsd = 0;
        _deposit = depositToken.balanceOf(_account);
        _lockedDeposit = lockedCollateral;
        _unlockedDeposit = _deposit - _lockedDeposit;
    }

    function mockCall(address _to, bytes memory _data) public {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory data) = _to.call(_data);
        require(success, extractRevertReason(data));
    }

    function extractRevertReason(bytes memory revertData) internal pure returns (string memory reason) {
        uint256 l = revertData.length;
        if (l < 68) return "";
        uint256 t;
        assembly {
            revertData := add(revertData, 4)
            t := mload(revertData) // Save the content of the length slot
            mstore(revertData, sub(l, 4)) // Set proper length
        }
        reason = abi.decode(revertData, (string));
        assembly {
            mstore(revertData, t) // Restore the content of the length slot
        }
    }
}
