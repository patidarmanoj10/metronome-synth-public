// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Governable.sol";
import "./interfaces/external/IWETH.sol";
import "./interfaces/INativeTokenGateway.sol";
import "./interfaces/IDepositToken.sol";

error SenderIsNotNativeToken();
error UnregisteredPool();

/**
 * @title Helper contract to easily support native tokens (e.g. ETH/AVAX) as collateral
 */
contract NativeTokenGateway is ReentrancyGuard, Governable, INativeTokenGateway {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using SafeERC20 for IDepositToken;

    IPoolRegistry public immutable poolRegistry;
    IWETH public immutable nativeToken;

    constructor(IPoolRegistry poolRegistry_, IWETH nativeToken_) {
        // Note: `NativeTokenGateway` isn't upgradable but extends `ReentrancyGuard` therefore we need to initialize it
        __ReentrancyGuard_init();
        poolRegistry = poolRegistry_;
        nativeToken = nativeToken_;
    }

    /**
     * @notice deposits NATIVE_TOKEN as collateral using native. A corresponding amount of the deposit token is minted.
     * @param pool_ The Pool contract
     */
    function deposit(IPool pool_) external payable override {
        if (!poolRegistry.isPoolRegistered(address(pool_))) revert UnregisteredPool();

        nativeToken.deposit{value: msg.value}();
        IDepositToken _depositToken = pool_.depositTokenOf(nativeToken);
        nativeToken.safeApprove(address(_depositToken), msg.value);
        _depositToken.deposit(msg.value, msg.sender);
    }

    /**
     * @notice withdraws the NATIVE_TOKEN deposit of msg.sender.
     * @param pool_ The Pool contract
     * @param amount_ The amount of deposit tokens to withdraw and receive native ETH
     */
    function withdraw(IPool pool_, uint256 amount_) external override nonReentrant {
        if (!poolRegistry.isPoolRegistered(address(pool_))) revert UnregisteredPool();

        IDepositToken _depositToken = pool_.depositTokenOf(nativeToken);
        _depositToken.safeTransferFrom(msg.sender, address(this), amount_);
        _depositToken.withdraw(amount_, address(this));
        nativeToken.withdraw(amount_);
        Address.sendValue(payable(msg.sender), amount_);
    }

    /**
     * @dev Only `nativeToken` contract is allowed to transfer to here. Prevent other addresses to send coins to this contract.
     */
    receive() external payable override {
        if (msg.sender != address(nativeToken)) revert SenderIsNotNativeToken();
    }
}
