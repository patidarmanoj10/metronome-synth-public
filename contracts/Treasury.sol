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

    function initialize(IController _controller) public initializer {
        __ReentrancyGuard_init();
        __Manageable_init();

        setController(_controller);
    }

    /**
     * @notice Pull token from the Treasury
     */
    function pull(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external override nonReentrant onlyController {
        require(_amount > 0, "amount-is-zero");
        _token.safeTransfer(_to, _amount);
    }

    /**
     * @notice Transfer all funds to another contract
     * @dev This function can become too expensive depending on the length of the arrays
     */
    function migrateTo(address _newTreasury) external onlyController {
        address[] memory _depositTokens = controller.getDepositTokens();

        for (uint256 i = 0; i < _depositTokens.length; ++i) {
            IDepositToken _depositToken = IDepositToken(_depositTokens[i]);

            uint256 _balance = _depositToken.balanceOf(address(this));
            uint256 _underlyingBalance = _depositToken.underlying().balanceOf(address(this));

            if (_balance > 0) _depositToken.safeTransfer(_newTreasury, _balance);
            if (_underlyingBalance > 0) _depositToken.underlying().safeTransfer(_newTreasury, _underlyingBalance);
        }

        address[] memory _syntheticAssets = controller.getSyntheticAssets();

        for (uint256 i = 0; i < _syntheticAssets.length; ++i) {
            IERC20 _vsAsset = IERC20(_syntheticAssets[i]);
            uint256 _balance = _vsAsset.balanceOf(address(this));
            if (_balance > 0) {
                _vsAsset.safeTransfer(_newTreasury, _balance);
            }
        }
    }
}
