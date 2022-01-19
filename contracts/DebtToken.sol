// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./access/Manageable.sol";
import "./storage/DebtTokenStorage.sol";
import "./lib/WadRayMath.sol";

/**
 * @title Non-transferable token that represents users' debts
 */
contract DebtToken is Manageable, DebtTokenStorageV1 {
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    function initialize(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        IController _controller,
        ISyntheticAsset _syntheticAsset
    ) public initializer {
        require(address(_controller) != address(0), "controller-address-is-zero");

        __Manageable_init();

        controller = _controller;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        syntheticAsset = _syntheticAsset;
        lastBlockAccrued = block.number;
        debtIndex = 1e18;
    }

    /**
     * @notice Get the updated (principal + interest) user's debt
     */
    function balanceOf(address _account) public view virtual override returns (uint256) {
        if (principalOf[_account] == 0) {
            return 0;
        }
        uint256 principalTimesIndex = principalOf[_account] * debtIndex;
        return principalTimesIndex / interestRateOf[_account];
    }

    function transfer(
        address, /*recipient*/
        uint256 /*amount*/
    ) public virtual override returns (bool) {
        revert("transfer-not-supported");
    }

    function allowance(
        address, /*owner*/
        address /*spender*/
    ) public view virtual override returns (uint256) {
        revert("allowance-not-supported");
    }

    function approve(
        address, /*spender*/
        uint256 /*amount*/
    ) public virtual override returns (bool) {
        revert("approval-not-supported");
    }

    function transferFrom(
        address, /*sender*/
        address, /*recipient*/
        uint256 /*amount*/
    ) public virtual override returns (bool) {
        revert("transfer-not-supported");
    }

    function increaseAllowance(
        address, /*spender*/
        uint256 /*addedValue*/
    ) public virtual returns (bool) {
        revert("allowance-not-supported");
    }

    function decreaseAllowance(
        address, /*spender*/
        uint256 /*subtractedValue*/
    ) public virtual returns (bool) {
        revert("allowance-not-supported");
    }

    /**
     * @dev Changes from the OZ original code: hooks removal
     */
    function _mint(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "mint-to-the-zero-address");

        _beforeTokenTransfer(address(0), _account, _amount);

        totalSupply += _amount;
        principalOf[_account] += _amount;
        interestRateOf[_account] = debtIndex;
        emit Transfer(address(0), _account, _amount);

        _afterTokenTransfer(address(0), _account, _amount);
    }

    /**
     * @dev Changes from the OZ original code: hooks removal
     */
    function _burn(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "burn-from-the-zero-address");

        // Note: Commented out because will never reach the hook implementation at this point
        // _beforeTokenTransfer(address(0), _account, _amount);

        uint256 accountBalance = balanceOf(_account);
        require(accountBalance >= _amount, "burn-amount-exceeds-balance");

        principalOf[_account] = accountBalance - _amount;
        interestRateOf[_account] = debtIndex;

        totalSupply -= _amount;

        emit Transfer(_account, address(0), _amount);

        _afterTokenTransfer(_account, address(0), _amount);
    }

    function _beforeTokenTransfer(
        address, /*_from*/
        address _to,
        uint256 /*_amount*/
    ) internal virtual {
        if (balanceOf(_to) == 0) {
            controller.addToDebtTokensOfAccount(_to);
        }
    }

    function _afterTokenTransfer(
        address _from,
        address, /* _to*/
        uint256 /*_amount*/
    ) internal virtual {
        if (balanceOf(_from) == 0) {
            controller.removeFromDebtTokensOfAccount(_from);
        }
    }

    /**
     * @notice Mint debt token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyController {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn debt token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyController {
        _burn(_from, _amount);
    }

    /**
     * @notice Get current block number
     * @dev Having this temporarilty as virtual for make test easier since for now hardhat doesn't support mine several blocks
     * See more: https://github.com/nomiclabs/hardhat/issues/1112
     */
    function getBlockNumber() public view virtual returns (uint256 _blockNumber) {
        _blockNumber = block.number;
    }

    /**
     * @notice Accrue interest over debt supply
     * @return _interestAccumulated The total amount of debt tokens accrued
     */
    function accrueInterest() external override onlyController returns (uint256 _interestAccumulated) {
        uint256 _currentBlockNumber = getBlockNumber();

        if (lastBlockAccrued == _currentBlockNumber) {
            return 0;
        }

        uint256 _blockDelta = _currentBlockNumber - lastBlockAccrued;

        uint256 _interestRateToAccrue = syntheticAsset.interestRatePerBlock() * _blockDelta;

        _interestAccumulated = _interestRateToAccrue.wadMul(totalSupply);

        totalSupply += _interestAccumulated;

        debtIndex += _interestRateToAccrue.wadMul(debtIndex);
    }
}
