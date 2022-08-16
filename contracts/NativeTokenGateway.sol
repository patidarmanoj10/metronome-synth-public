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
     * @param _controller The Controller contract
     */
    function deposit(IController _controller) external payable override {
        nativeToken.deposit{value: msg.value}();
        IDepositToken _vsdToken = _controller.depositTokenOf(nativeToken);
        nativeToken.safeApprove(address(_vsdToken), msg.value);
        _vsdToken.deposit(msg.value, _msgSender());
    }

    /**
     * @notice withdraws the NATIVE_TOKEN deposit of msg.sender.
     * @param _controller The Controller contract
     * @param _amount The amount of deposit tokens to withdraw and receive native ETH
     */
    function withdraw(IController _controller, uint256 _amount) external override nonReentrant {
        IDepositToken _vsdToken = _controller.depositTokenOf(nativeToken);
        _vsdToken.safeTransferFrom(_msgSender(), address(this), _amount);
        _vsdToken.withdraw(_amount, address(this));
        nativeToken.withdraw(_amount);
        Address.sendValue(payable(_msgSender()), _amount);
    }

    /**
     * @dev Only NATIVE_TOKEN contract is allowed to transfer to here. Prevent other addresses to send coins to this contract.
     */
    receive() external payable override {
        require(_msgSender() == address(nativeToken), "receive-not-allowed");
    }
}
