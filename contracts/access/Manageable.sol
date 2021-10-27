// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./Governable.sol";
import "../interface/IDebtToken.sol";
import "../interface/IMBox.sol";
import "../interface/IIssuer.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is Governable {
    /**
     * @notice mBox contract
     */
    IMBox public mBox;

    /**
     * @notice mBox contract
     */
    IIssuer public issuer;

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init() internal initializer {
        __Governable_init();
    }

    /**
     * @notice Requires that the caller is the mBox contract
     */
    modifier onlyMBox() {
        require(_msgSender() == address(mBox), "not-mbox");
        _;
    }

    /**
     * @notice Requires that the caller is the Issuer contract
     */
    modifier onlyIssuer() {
        require(_msgSender() == address(issuer), "not-issuer");
        _;
    }

    /**
     * @notice Update mBox contract
     * @param _mBox The new mBox contract
     */
    function setMBox(IMBox _mBox) public onlyGovernor {
        require(address(_mBox) != address(0), "new-mbox-address-is-zero");
        mBox = _mBox;
    }

    function setIssuer(IIssuer _issuer) public onlyGovernor {
        require(address(_issuer) != address(0), "new-issuer-address-is-zero");
        issuer = _issuer;
    }

    uint256[49] private __gap;
}
