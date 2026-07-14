// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {ISyntheticToken} from "../interfaces/ISyntheticToken.sol";
import {IProxyOFT} from "../interfaces/IProxyOFT.sol";

abstract contract ProxyOFTStorageV1 is IProxyOFT {
    /**
     * @notice The synthetic token contract
     */
    ISyntheticToken internal syntheticToken;
}
