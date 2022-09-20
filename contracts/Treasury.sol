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
        require(pool.isDepositTokenExists(IDepositToken(_msgSender())), "not-deposit-token");
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
        IDepositToken(_msgSender()).underlying().safeTransfer(_to, _amount);
    }

    /**
     * @notice Transfer all funds to another contract
     * @dev This function can become too expensive depending on the length of the arrays
     */
    function migrateTo(address _newTreasury) external override onlyPool {
        address[] memory _depositTokens = pool.getDepositTokens();
        uint256 _depositTokensLength = _depositTokens.length;

        for (uint256 i; i < _depositTokensLength; ++i) {
            IDepositToken _depositToken = IDepositToken(_depositTokens[i]);
            IERC20 _underlying = _depositToken.underlying();

            uint256 _balance = _depositToken.balanceOf(address(this));
            uint256 _underlyingBalance = _underlying.balanceOf(address(this));

            if (_balance > 0) {
                _depositToken.safeTransfer(_newTreasury, _balance);
            }
            if (_underlyingBalance > 0) {
                _underlying.safeTransfer(_newTreasury, _underlyingBalance);
            }
        }

        address[] memory _debtTokens = pool.getDebtTokens();
        uint256 _debtTokensLength = _debtTokens.length;

        for (uint256 i; i < _debtTokensLength; ++i) {
            IERC20 _msAsset = IDebtToken(_debtTokens[i]).syntheticToken();
            uint256 _balance = _msAsset.balanceOf(address(this));
            if (_balance > 0) {
                _msAsset.safeTransfer(_newTreasury, _balance);
            }
        }
    }
}
