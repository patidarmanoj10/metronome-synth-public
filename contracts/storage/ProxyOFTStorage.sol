// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/ISyntheticToken.sol";
import "../interfaces/IProxyOFT.sol";

abstract contract ProxyOFTStorageV1 is IProxyOFT {
    ISyntheticToken internal syntheticToken;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[49] private __gap;
}
