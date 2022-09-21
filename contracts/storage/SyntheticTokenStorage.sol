// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/ISyntheticToken.sol";
import "../interfaces/IPoolRegistry.sol";

abstract contract SyntheticTokenStorageV1 is ISyntheticToken {
    mapping(address => uint256) public balanceOf;

    mapping(address => mapping(address => uint256)) public allowance;

    string public name;
    string public symbol;

    uint256 public totalSupply;

    IPoolRegistry public poolRegistry;

    uint8 public decimals;

    /**
     * @notice If a msAsset isn't active, it disables minting new tokens
     */
    bool public isActive;
}
