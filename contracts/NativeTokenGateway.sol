// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Governable.sol";
import "./interfaces/external/IWETH.sol";
import "./interfaces/INativeTokenGateway.sol";
import "./interfaces/IDepositToken.sol";

/**
 * @title Helper contract to easily support native tokens (e.g. ETH/AVAX) as collateral
 */
contract NativeTokenGateway is ReentrancyGuard, Governable, INativeTokenGateway {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using SafeERC20 for IDepositToken;

    IWETH public immutable nativeToken;

    constructor(IWETH _nativeToken) {
        nativeToken = _nativeToken;
    }

    /**
     * @notice deposits NATIVE_TOKEN as collateral using native. A corresponding amount of the deposit token is minted.
     * @param _pool The Pool contract
     */
    function deposit(IPool _pool) external payable override {
        nativeToken.deposit{value: msg.value}();
        IDepositToken _msdToken = _pool.depositTokenOf(nativeToken);
        nativeToken.safeApprove(address(_msdToken), msg.value);
        _msdToken.deposit(msg.value, msg.sender);
    }

    /**
     * @notice withdraws the NATIVE_TOKEN deposit of msg.sender.
     * @param _pool The Pool contract
     * @param _amount The amount of deposit tokens to withdraw and receive native ETH
     */
    function withdraw(IPool _pool, uint256 _amount) external override nonReentrant {
        IDepositToken _msdToken = _pool.depositTokenOf(nativeToken);
        _msdToken.safeTransferFrom(msg.sender, address(this), _amount);
        _msdToken.withdraw(_amount, address(this));
        nativeToken.withdraw(_amount);
        Address.sendValue(payable(msg.sender), _amount);
    }

    /**
     * @dev Only NATIVE_TOKEN contract is allowed to transfer to here. Prevent other addresses to send coins to this contract.
     */
    receive() external payable override {
        require(msg.sender == address(nativeToken), "receive-not-allowed");
    }
}
