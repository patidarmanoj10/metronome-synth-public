// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Manageable.sol";
import "./interface/ITreasury.sol";

contract TreasuryStorageV1 {}

/**
 * @title Treasury contract
 */
contract Treasury is ITreasury, ReentrancyGuard, Manageable, TreasuryStorageV1 {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";

    function initialize(IIssuer _issuer) public initializer {
        __ReentrancyGuard_init();
        __Manageable_init();

        setIssuer(_issuer);
    }

    /**
     * @notice Pull token from the Treasury
     */
    function pull(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external override nonReentrant onlyIssuer {
        require(_amount > 0, "amount-is-zero");
        _token.safeTransfer(_to, _amount);
    }
}
