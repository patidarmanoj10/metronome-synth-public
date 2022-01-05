// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./access/Governable.sol";
import "./interface/external/IWETH.sol";
import "./interface/IWETHGateway.sol";
import "./interface/IDepositToken.sol";

/**
 * @title Helper contract to support native ETH as collateral easily
 */
contract WETHGateway is Governable, IWETHGateway {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using SafeERC20 for IDepositToken;

    IWETH public immutable weth;

    constructor(IWETH _weth) {
        weth = _weth;
    }

    function authorizeVSynth(address _vSynth) external onlyGovernor {
        weth.safeApprove(_vSynth, type(uint256).max);
    }

    /**
     * @notice deposits WETH as collateral using native ETH. A corresponding amount of the deposit token is minted.
     * @param _vSynth The VSynth contract
     */
    function depositETH(IVSynth _vSynth) external payable override {
        weth.deposit{value: msg.value}();
        IDepositToken _depositToken = _vSynth.issuer().depositTokenOf(weth);
        _vSynth.deposit(_depositToken, msg.value, msg.sender);
    }

    /**
     * @notice withdraws the weth _reserves of msg.sender.
     * @param _vSynth The VSynth contract
     * @param _amount The amount of deposit tokens to withdraw and receive native ETH
     */
    function withdrawETH(IVSynth _vSynth, uint256 _amount) external override {
        IDepositToken _depositToken = _vSynth.issuer().depositTokenOf(weth);
        _depositToken.safeTransferFrom(msg.sender, address(this), _amount);
        _vSynth.withdraw(_depositToken, _amount, address(this));
        weth.withdraw(_amount);
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
     * @dev Only WETH contract is allowed to transfer ETH here. Prevent other addresses to send ETH to this contract.
     */
    receive() external payable {
        require(msg.sender == address(weth), "receive-not-allowed");
    }

    /**
     * @dev Revert fallback calls
     */
    fallback() external payable {
        revert("fallback-not-allowed");
    }
}
