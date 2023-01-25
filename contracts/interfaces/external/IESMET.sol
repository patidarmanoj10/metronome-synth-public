// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../IFeeProvider.sol";

interface IESMET {
    function balanceOf(address account_) external view returns (uint256);
}
