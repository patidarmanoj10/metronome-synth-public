// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
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
     * @dev Throws if caller isn't authorized
     */
    modifier onlyIfAuthorized() {
        require(
            msg.sender == address(controller) || controller.isDepositTokenExists(IDepositToken(msg.sender)),
            "not-authorized"
        );
        _;
    }

    function initialize(IController _controller) public initializer {
        require(address(_controller) != address(0), "controller-address-is-zero");

        __ReentrancyGuard_init();
        __Manageable_init();

        controller = _controller;
    }

    /**
     * @notice Pull token from the Treasury
     */
    function pull(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external override nonReentrant onlyIfAuthorized {
        require(_amount > 0, "amount-is-zero");
        _token.safeTransfer(_to, _amount);
    }

    /**
     * @notice Transfer all funds to another contract
     * @dev This function can become too expensive depending on the length of the arrays
     */
    function migrateTo(address _newTreasury) external override onlyController {
        address[] memory _depositTokens = controller.getDepositTokens();

        for (uint256 i = 0; i < _depositTokens.length; ++i) {
            IDepositToken _depositToken = IDepositToken(_depositTokens[i]);

            uint256 _balance = _depositToken.balanceOf(address(this));
            uint256 _underlyingBalance = _depositToken.underlying().balanceOf(address(this));

            if (_balance > 0) _depositToken.safeTransfer(_newTreasury, _balance);
            if (_underlyingBalance > 0) _depositToken.underlying().safeTransfer(_newTreasury, _underlyingBalance);
        }

        address[] memory _syntheticTokens = controller.getSyntheticTokens();

        for (uint256 i = 0; i < _syntheticTokens.length; ++i) {
            IERC20 _vsAsset = IERC20(_syntheticTokens[i]);
            uint256 _balance = _vsAsset.balanceOf(address(this));
            if (_balance > 0) {
                _vsAsset.safeTransfer(_newTreasury, _balance);
            }
        }
    }
}
