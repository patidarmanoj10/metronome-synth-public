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

    /**
     * @dev Throws if caller isn't authorized
     */
    modifier onlyIfAuthorized() {
        require(_msgSender() == address(controller) || _msgSender() == address(syntheticToken), "not-authorized");
        _;
    }

    /**
     * @dev Throws if the caller isn't the synthetic token
     */
    modifier onlyIfSyntheticToken() {
        require(_msgSender() == address(syntheticToken), "not-synthetic-token");
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. mint/burn)
     */
    modifier updateRewardsBeforeMintOrBurn(address _account) {
        IRewardsDistributor[] memory _rewardsDistributors = controller.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeMintOrBurn(syntheticToken, _account);
        }
        _;
    }

    function initialize(
        string calldata _name,
        string calldata _symbol,
        IController _controller,
        ISyntheticToken _syntheticToken
    ) public initializer {
        require(address(_controller) != address(0), "controller-address-is-zero");
        require(address(_syntheticToken) != address(0), "synthetic-is-null");

        __Manageable_init();

        name = _name;
        symbol = _symbol;
        decimals = _syntheticToken.decimals();
        controller = _controller;
        syntheticToken = _syntheticToken;
        lastTimestampAccrued = block.timestamp;
        debtIndex = 1e18;
    }

    function totalSupply() external view override returns (uint256) {
        (uint256 _interestAmountAccrued, , ) = _calculateInterestAccrual();

        return totalSupply_ + _interestAmountAccrued;
    }

    /**
     * @notice Get the updated (principal + interest) user's debt
     */
    function balanceOf(address _account) public view override returns (uint256) {
        if (principalOf[_account] == 0) {
            return 0;
        }

        (, uint256 _debtIndex, ) = _calculateInterestAccrual();

        // Note: The `debtIndex / debtIndexOf` gives the interest to apply to the principal amount
        return (principalOf[_account] * _debtIndex) / debtIndexOf[_account];
    }

    function transfer(
        address, /*recipient*/
        uint256 /*amount*/
    ) external pure override returns (bool) {
        revert("transfer-not-supported");
    }

    function allowance(
        address, /*owner*/
        address /*spender*/
    ) external pure override returns (uint256) {
        revert("allowance-not-supported");
    }

    function approve(
        address, /*spender*/
        uint256 /*amount*/
    ) external pure override returns (bool) {
        revert("approval-not-supported");
    }

    function transferFrom(
        address, /*sender*/
        address, /*recipient*/
        uint256 /*amount*/
    ) external pure override returns (bool) {
        revert("transfer-not-supported");
    }

    function increaseAllowance(
        address, /*spender*/
        uint256 /*addedValue*/
    ) external pure returns (bool) {
        revert("allowance-not-supported");
    }

    function decreaseAllowance(
        address, /*spender*/
        uint256 /*subtractedValue*/
    ) external pure returns (bool) {
        revert("allowance-not-supported");
    }

    function _mint(address _account, uint256 _amount) private updateRewardsBeforeMintOrBurn(_account) {
        require(_account != address(0), "mint-to-the-zero-address");

        uint256 _accountBalance = balanceOf(_account);

        totalSupply_ += _amount;
        principalOf[_account] += _amount;
        debtIndexOf[_account] = debtIndex;
        emit Transfer(address(0), _account, _amount);

        _addToDebtTokensOfRecipientIfNeeded(_account, _accountBalance);
    }

    function _burn(address _account, uint256 _amount) private updateRewardsBeforeMintOrBurn(_account) {
        require(_account != address(0), "burn-from-the-zero-address");

        uint256 accountBalance = balanceOf(_account);
        require(accountBalance >= _amount, "burn-amount-exceeds-balance");

        unchecked {
            principalOf[_account] = accountBalance - _amount;
            debtIndexOf[_account] = debtIndex;

            totalSupply_ -= _amount;
        }

        emit Transfer(_account, address(0), _amount);

        _removeFromDebtTokensOfSenderIfNeeded(_account, balanceOf(_account));
    }

    function _addToDebtTokensOfRecipientIfNeeded(address _recipient, uint256 _recipientBalanceBefore) private {
        if (_recipientBalanceBefore == 0) {
            controller.addToDebtTokensOfAccount(_recipient);
        }
    }

    function _removeFromDebtTokensOfSenderIfNeeded(address _sender, uint256 _senderBalanceAfter) private {
        if (_senderBalanceAfter == 0) {
            controller.removeFromDebtTokensOfAccount(_sender);
        }
    }

    /**
     * @notice Mint debt token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) external override onlyIfSyntheticToken {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn debt token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) external override onlyIfAuthorized {
        _burn(_from, _amount);
    }

    /**
     * @notice Calculate interest to accrue
     * @dev This util function avoids code duplication across `balanceOf` and `accrueInterest`
     * @return _interestAmountAccrued The total amount of debt tokens accrued
     * @return _debtIndex The new `debtIndex` value
     * @return _currentTimestamp The current block timestamp
     */

    function _calculateInterestAccrual()
        private
        view
        returns (
            uint256 _interestAmountAccrued,
            uint256 _debtIndex,
            uint256 _currentTimestamp
        )
    {
        _currentTimestamp = block.timestamp;

        if (lastTimestampAccrued == _currentTimestamp) {
            return (0, debtIndex, _currentTimestamp);
        }

        uint256 _interestRateToAccrue = syntheticToken.interestRatePerSecond() *
            (_currentTimestamp - lastTimestampAccrued);

        _interestAmountAccrued = _interestRateToAccrue.wadMul(totalSupply_);

        _debtIndex = debtIndex + _interestRateToAccrue.wadMul(debtIndex);
    }

    /**
     * @notice Accrue interest over debt supply
     * @return _interestAmountAccrued The total amount of debt tokens accrued
     */
    function accrueInterest() external override onlyIfSyntheticToken returns (uint256 _interestAmountAccrued) {
        uint256 _debtIndex;
        uint256 _currentTimestamp;

        (_interestAmountAccrued, _debtIndex, _currentTimestamp) = _calculateInterestAccrual();

        if (_currentTimestamp == lastTimestampAccrued) {
            return 0;
        }

        totalSupply_ += _interestAmountAccrued;
        debtIndex = _debtIndex;
        lastTimestampAccrued = _currentTimestamp;
    }
}
