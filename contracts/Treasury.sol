// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/ITreasury.sol";

/**
 * @title Treasury contract
 */
contract Treasury is Ownable, ReentrancyGuard, ITreasury {
    using SafeERC20 for IERC20;

    /**
     * @notice The MET contract
     */
    IERC20 public met;

    constructor(IERC20 _met) {
        require(address(_met) != address(0), "met-address-is-null");
        met = _met;
    }

    /**
     * @notice Pull MET from the Treasury
     */
    function pull(address _to, uint256 _amount) external override onlyOwner {
        require(_amount > 0, "amount-is-zero");
        met.safeTransfer(_to, _amount);
    }

    /**
     * @notice Deploy MET to yield generation strategy
     */
    function rebalance() external onlyOwner {
        // TODO
    }
}