// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";
import {IProxyOFT} from "../interfaces/IProxyOFT.sol";
import {ISyntheticToken} from "../interfaces/ISyntheticToken.sol";

abstract contract SyntheticTokenStorageV1 is ISyntheticToken {
    /**
     * @notice The name of the token
     */
    string public override name;

    /**
     * @notice The symbol of the token
     */
    string public override symbol;

    /**
     * @dev The amount of tokens owned by `account`
     */
    mapping(address => uint256) public override balanceOf;

    /**
     * @dev The remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}
     */
    mapping(address => mapping(address => uint256)) public override allowance;

    /**
     * @dev Amount of tokens in existence
     */
    uint256 public override totalSupply;

    /**
     * @notice The supply cap
     */
    uint256 public override maxTotalSupply;

    /**
     * @dev The Pool Registry
     */
    IPoolRegistry internal _poolRegistry;

    /**
     * @notice If true, disables msAsset minting globally
     */
    bool public override isActive;

    /**
     * @notice The decimals of the token
     */
    uint8 public override decimals;

    /**
     * @notice The ProxyOFT contract
     */
    IProxyOFT public override proxyOFT;

    /**
     * @notice Track amount received cross-chain
     */
    uint256 public totalBridgedIn;

    /**
     * @notice Track amount sent cross-chain
     */
    uint256 public totalBridgedOut;

    /**
     * @notice Maximum allowed bridged-in (mint-related) supply
     */
    uint256 public maxBridgedInSupply;

    /**
     * @notice Maximum allowed bridged-out (burn-related) supply
     */
    uint256 public maxBridgedOutSupply;
}

abstract contract SyntheticTokenStorageV2 is SyntheticTokenStorageV1 {
    /**
     * @notice Automated Market Operator, it can be a contract, safe or EOA
     */
    address public amo;

    /**
     * @notice Maximum Synth AMO can mint. It can be updated by admin/governor.
     */
    uint256 public maxAmoSupply;

    /**
     * @notice Synth minted by AMO so far. It will be reduced when Synths are burnt by AMO.
     */
    uint256 public amoSupply;
}
