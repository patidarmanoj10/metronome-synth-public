// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Manageable.sol";
import "./storage/TreasuryStorage.sol";

/**
 * @title Treasury contract
 */
contract Treasury is ReentrancyGuard, Manageable, TreasuryStorageV1 {
    using SafeERC20 for IERC20;
    using SafeERC20 for IDepositToken;

    string public constant VERSION = "1.0.0";

    /**
     * @dev Throws if caller isn't a deposit token
     */
    modifier onlyIfDepositToken() {
        require(pool.isDepositTokenExists(IDepositToken(msg.sender)), "not-deposit-token");
        _;
    }

    function initialize(IPool _pool) public initializer {
        require(address(_pool) != address(0), "pool-address-is-zero");

        __ReentrancyGuard_init();
        __Manageable_init();

        pool = _pool;
    }

    /**
     * @notice Pull token from the Treasury
     */
    function pull(address _to, uint256 _amount) external override nonReentrant onlyIfDepositToken {
        require(_amount > 0, "amount-is-zero");
        IDepositToken(msg.sender).underlying().safeTransfer(_to, _amount);
    }

    /**
     * @notice Transfer all funds to another contract
     * @dev This function can become too expensive depending on the length of the arrays
     */
    function migrateTo(address _newTreasury) external override onlyPool {
        address[] memory _depositTokens = pool.getDepositTokens();
        uint256 _depositTokensLength = _depositTokens.length;

        for (uint256 i; i < _depositTokensLength; ++i) {
            IERC20 _underlying = IDepositToken(_depositTokens[i]).underlying();

            uint256 _underlyingBalance = _underlying.balanceOf(address(this));

            if (_underlyingBalance > 0) {
                _underlying.safeTransfer(_newTreasury, _underlyingBalance);
            }
        }
    }
}
