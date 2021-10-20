// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Manageable.sol";
import "./interface/ITreasury.sol";

contract TreasuryStorageV1 {
    /**
     * @notice The MET contract
     */
    IERC20 public met;
}

/**
 * @title Treasury contract
 */
contract Treasury is ITreasury, ReentrancyGuard, Manageable, TreasuryStorageV1 {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";

    function initialize(IERC20 _met, IMBox _mBox) public initializer {
        require(address(_met) != address(0), "met-address-is-null");

        __ReentrancyGuard_init();
        __Manageable_init();

        setMBox(_mBox);

        met = _met;
    }

    /**
     * @notice Pull MET from the Treasury
     */
    function pull(address _to, uint256 _amount) external override onlyMBox {
        require(_amount > 0, "amount-is-zero");
        met.safeTransfer(_to, _amount);
    }
}
