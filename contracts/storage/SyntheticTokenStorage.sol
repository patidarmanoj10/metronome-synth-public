// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/ISyntheticToken.sol";

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
    IPoolRegistry public override poolRegistry;

    /**
     * @notice If true, disables msAsset minting globally
     */
    bool public override isActive;

    /**
     * @notice The decimals of the token
     */
    uint8 public override decimals;

    // TODO: Comment
    IProxyOFT public override proxyOFT;

    // TODO: Comment
    // Note 1: Possible ways to track bridge impact on supply
    // 1) `uint bridgingSupply`: Increases when minting + Decreases if burning amount <= bridgingSupply, when minting, requires `bridgingSupply <= maxBridgingSupply`
    // 2) `int bridgingSupply`: Increases when minting + Decreases when burning. The sum of `bridgingSupply` values among chains must be `0`. when minting, requires `bridgingSupply <= maxBridgingSupply`
    // 3) `totalBridgedIn` + `totalBridgedOut`: when minting, requires `(totalBridgedIn - totalBridgedOut) <= maxBridgingSupply`
    //
    // Note 2: We may move these vars and limits handle to the `ProxyOFT` contract,
    // it would make all bridging-related logic will live apart `SyntheticToken` implementation but is safer to keep it here
    uint256 public totalBridgedIn;
    uint256 public totalBridgedOut;

    // TODO: Comment
    // Note 1: Possible ways to cap bridge impact on supply
    // 1) maxBridgingBalance: Limits both ways `abs(totalBridgedIn - totalBridgedOut)`
    // 2) maxBridgingBalance: Limits mintings only (assumes burns aren't a problem)
    //
    // Note 2: We may move these vars and limits handle to the `ProxyOFT` contract,
    // it would make all bridging-related logic will live apart `SyntheticToken` implementation but is safer to keep it here
    uint256 public maxBridgingBalance;
}
