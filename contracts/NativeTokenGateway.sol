// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./access/Governable.sol";
import "./interface/external/IWETH.sol";
import "./interface/INativeTokenGateway.sol";
import "./interface/IDepositToken.sol";

/**
 * @title Helper contract to easily support native tokens (e.g. ETH/AVAX) as collateral
 */
contract NativeTokenGateway is Governable, INativeTokenGateway {
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
        _vsdToken.deposit(msg.value, msg.sender);
    }

    /**
     * @notice withdraws the NATIVE_TOKEN deposit of msg.sender.
     * @param _controller The Controller contract
     * @param _amount The amount of deposit tokens to withdraw and receive native ETH
     */
    function withdraw(IController _controller, uint256 _amount) external override {
        IDepositToken _vsdToken = _controller.depositTokenOf(nativeToken);
        _vsdToken.safeTransferFrom(msg.sender, address(this), _amount);
        _vsdToken.withdraw(_amount, address(this));
        nativeToken.withdraw(_amount);
        Address.sendValue(payable(msg.sender), _amount);
    }

    /**
     * @notice ERC20 recovery in case of stuck tokens due direct transfers to the contract address.
     * @param _token The token to transfer
     * @param _to The recipient of the transfer
     * @param _amount The amount to send
     */
    function emergencyTokenTransfer(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external onlyGovernor {
        _token.safeTransfer(_to, _amount);
    }

    /**
     * @dev Only NATIVE_TOKEN contract is allowed to transfer to here. Prevent other addresses to send coins to this contract.
     */
    receive() external payable {
        require(msg.sender == address(nativeToken), "receive-not-allowed");
    }

    /**
     * @dev Revert fallback calls
     */
    fallback() external payable {
        revert("fallback-not-allowed");
    }
}
