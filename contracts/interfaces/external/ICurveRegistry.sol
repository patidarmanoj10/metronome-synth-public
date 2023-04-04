// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

// solhint-disable func-name-mixedcase
interface ICurveRegistry {
    function get_virtual_price_from_lp_token(address) external view returns (uint256);
}
