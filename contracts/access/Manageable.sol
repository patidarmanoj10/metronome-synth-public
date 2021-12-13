// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./Governable.sol";
import "../interface/IDebtToken.sol";
import "../interface/IVSynths.sol";
import "../interface/IIssuer.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is Governable {
    /**
     * @notice vSynths contract
     */
    IVSynths public vSynths;

    /**
     * @notice Issuer contract
     */
    IIssuer public issuer;

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init() internal initializer {
        __Governable_init();
    }

    /**
     * @notice Requires that the caller is the vSynths contract
     */
    modifier onlyVSynths() {
        require(_msgSender() == address(vSynths), "not-vsynths");
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
     * @notice Update vSynths contract
     * @param _vSynths The new vSynths contract
     */
    function setVSynths(IVSynths _vSynths) public onlyGovernor {
        require(address(_vSynths) != address(0), "new-vsynths-address-is-zero");
        vSynths = _vSynths;
    }

    function setIssuer(IIssuer _issuer) public onlyGovernor {
        require(address(_issuer) != address(0), "new-issuer-address-is-zero");
        issuer = _issuer;
    }

    uint256[49] private __gap;
}
