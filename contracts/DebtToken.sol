// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./access/Manageable.sol";
import "./interface/IDebtToken.sol";
import "./lib/WadRayMath.sol";

contract DebtTokenStorageV1 {
    mapping(address => uint256) internal _principalOf;
    mapping(address => uint256) internal _interestRateOf;

    uint256 internal _totalSupply;
    uint8 internal _decimals;
    string internal _name;
    string internal _symbol;

    ISyntheticAsset internal _syntheticAsset;

    /**
     * @notice The block when interest accrual was calculated for the last time
     */
    uint256 public _lastBlockAccrued;

    /**
     * @notice Accumulator of the total earned interest rate since the beginning
     */
    uint256 public _debtIndex;
}

/**
 * @title Non-transferable token that represents users' debts
 */
contract DebtToken is IDebtToken, Manageable, DebtTokenStorageV1 {
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        IIssuer issuer_,
        ISyntheticAsset syntheticAsset_
    ) public initializer {
        __Manageable_init();

        setIssuer(issuer_);

        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        _syntheticAsset = syntheticAsset_;
        _lastBlockAccrued = block.number;
        _debtIndex = 1e18;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Get the updated (principal + interest) user's debt
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        if (_principalOf[account] == 0) {
            return 0;
        }
        uint256 principalTimesIndex = _principalOf[account] * _debtIndex;
        return principalTimesIndex / _interestRateOf[account];
    }

    function syntheticAsset() public view virtual override returns (ISyntheticAsset) {
        return _syntheticAsset;
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
    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "mint-to-the-zero-address");

        _totalSupply += amount;
        _principalOf[account] += amount;
        _interestRateOf[account] = _debtIndex;
        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev Changes from the OZ original code: hooks removal
     */
    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "burn-from-the-zero-address");

        uint256 accountBalance = balanceOf(account);
        require(accountBalance >= amount, "burn-amount-exceeds-balance");

        _principalOf[account] = accountBalance - amount;
        _interestRateOf[account] = _debtIndex;

        _totalSupply -= amount;

        emit Transfer(account, address(0), amount);
    }

    /**
     * @notice Mint debt token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyIssuer {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn debt token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyIssuer {
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
    function accrueInterest() external override onlyIssuer returns (uint256 _interestAccumulated) {
        uint256 _currentBlockNumber = getBlockNumber();

        if (_lastBlockAccrued == _currentBlockNumber) {
            return 0;
        }

        uint256 _blockDelta = _currentBlockNumber - _lastBlockAccrued;

        uint256 _interestRateToAccrue = _syntheticAsset.interestRatePerBlock() * _blockDelta;

        _interestAccumulated = _interestRateToAccrue.wadMul(totalSupply());

        _totalSupply += _interestAccumulated;

        _debtIndex += _interestRateToAccrue.wadMul(_debtIndex);
    }
}
