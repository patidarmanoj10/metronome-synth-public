// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./Governable.sol";
import "../interface/IDebtToken.sol";
import "../interface/IVSynth.sol";
import "../interface/IIssuer.sol";

/**
 * @title Reusable contract that handles accesses
 */
abstract contract Manageable is Governable {
    /**
     * @notice vSynth contract
     */
    IVSynth public vSynth;

    /**
     * @notice Issuer contract
     */
    IIssuer public issuer;

    // solhint-disable-next-line func-name-mixedcase
    function __Manageable_init() internal initializer {
        __Governable_init();
    }

    /**
     * @notice Requires that the caller is the vSynth contract
     */
    modifier onlyVSynth() {
        require(_msgSender() == address(vSynth), "not-vsynth");
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
     * @notice Update vSynth contract
     * @param _vSynth The new vSynth contract
     */
    function setVSynth(IVSynth _vSynth) public onlyGovernor {
        require(address(_vSynth) != address(0), "new-vsynth-address-is-zero");
        vSynth = _vSynth;
    }

    function setIssuer(IIssuer _issuer) public onlyGovernor {
        require(address(_issuer) != address(0), "new-issuer-address-is-zero");
        issuer = _issuer;
    }

    uint256[49] private __gap;
}
