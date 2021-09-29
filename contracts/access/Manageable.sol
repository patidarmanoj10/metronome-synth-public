// SPDX-License-Identifier: MIT

pragma solidity 0.8.8;

import "./Governable.sol";
import "../interface/IDebtToken.sol";
import "../interface/IMBox.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is Governable {
    /**
     * @notice mBox contract
     */
    IMBox public mBox;

    /**
     * @notice Requires that the caller is the mBox contract
     */
    modifier onlyMBox() {
        require(_msgSender() == address(mBox), "not-mbox");
        _;
    }

    /**
     * @notice Set mBox contract
     * @param _mBox The new mBox contract
     */
    function setMBox(IMBox _mBox) public onlyGovernor {
        require(address(_mBox) != address(0), "new-mbox-address-is-zero");
        mBox = _mBox;
    }
}
