// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";

/**
 * @title Utils contract that handles tokens sent to it
 */
abstract contract TokenHolder {
    using SafeERC20 for IERC20;

    /**
     * @notice Function that reverts if the caller isn't allowed to sweep tokens
     */
    function _requireCanSweep() internal view virtual;

    /**
     * @notice ERC20 recovery in case of stuck tokens due direct transfers to the contract address.
     * @param _token The token to transfer
     * @param _to The recipient of the transfer
     * @param _amount The amount to send
     */
    function sweep(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external {
        _requireCanSweep();

        if (address(_token) == address(0)) {
            Address.sendValue(payable(_to), _amount);
        } else {
            _token.safeTransfer(_to, _amount);
        }
    }

    /**
     * @dev Revert when receiving by default
     */
    receive() external payable virtual {
        revert("receive-not-allowed");
    }

    /**
     * @dev Revert fallback calls
     */
    fallback() external payable {
        revert("fallback-not-allowed");
    }
}
