// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./ICurveRegistry.sol";

// solhint-disable func-name-mixedcase
interface ICurveAddressProvider {
    function get_registry() external view returns (ICurveRegistry);
}
