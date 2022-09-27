// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Manageable.sol";
import "./storage/DebtTokenStorage.sol";
import "./lib/WadRayMath.sol";

/**
 * @title Non-transferable token that represents users' debts
 */
contract DebtToken is ReentrancyGuard, Manageable, DebtTokenStorageV1 {
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupply, uint256 newMaxTotalSupply);

    /// @notice Emitted when interest rate is updated
    event InterestRateUpdated(uint256 oldInterestRate, uint256 newInterestRate);

    /// @notice Emitted when synthetic token is issued
    event SyntheticTokenIssued(address indexed account, address indexed to, uint256 amount, uint256 fee);

    /// @notice Emitted when synthetic's debt is repaid
    event DebtRepaid(address indexed payer, address indexed account, uint256 amount, uint256 fee);

    /// @notice Emitted when active flag is updated
    event DebtTokenActiveUpdated(bool oldActive, bool newActive);

    /**
     * @dev Throws if sender can't burn
     */
    modifier onlyIfCanBurn() {
        require(msg.sender == address(pool), "not-pool");
        _;
    }

    /**
     * @dev Throws if synthetic token isn't enabled
     */
    modifier onlyIfSyntheticTokenIsActive() {
        require(syntheticToken.isActive(), "synthetic-inactive");
        require(isActive, "debt-token-inactive");
        _;
    }

    /**
     * @dev Throws if synthetic token doesn't exist
     */
    modifier onlyIfSyntheticTokenExists() {
        require(pool.isSyntheticTokenExists(syntheticToken), "synthetic-inexistent");
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. mint/burn)
     */
    modifier updateRewardsBeforeMintOrBurn(address _account) {
        IRewardsDistributor[] memory _rewardsDistributors = pool.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeMintOrBurn(syntheticToken, _account);
        }
        _;
    }

    function initialize(
        string calldata _name,
        string calldata _symbol,
        IPool _pool,
        ISyntheticToken _syntheticToken,
        uint256 _interestRate,
        uint256 _maxTotalSupplyInUsd
    ) public initializer {
        require(address(_pool) != address(0), "pool-address-is-zero");
        require(address(_syntheticToken) != address(0), "synthetic-is-null");

        __Manageable_init();

        name = _name;
        symbol = _symbol;
        decimals = _syntheticToken.decimals();
        pool = _pool;
        syntheticToken = _syntheticToken;
        lastTimestampAccrued = block.timestamp;
        debtIndex = 1e18;
        interestRate = _interestRate;
        maxTotalSupplyInUsd = _maxTotalSupplyInUsd;
        isActive = true;
    }

    function interestRatePerSecond() public view override returns (uint256) {
        return interestRate / SECONDS_PER_YEAR;
    }

    function totalSupply() external view override returns (uint256) {
        (uint256 _interestAmountAccrued, ) = _calculateInterestAccrual();

        return totalSupply_ + _interestAmountAccrued;
    }

    /**
     * @notice Get the updated (principal + interest) user's debt
     */
    function balanceOf(address _account) public view override returns (uint256) {
        if (principalOf[_account] == 0) {
            return 0;
        }

        (, uint256 _debtIndex) = _calculateInterestAccrual();

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

        uint256 _balanceBefore = balanceOf(_account);

        totalSupply_ += _amount;
        require(
            pool.masterOracle().quoteTokenToUsd(address(syntheticToken), totalSupply_) <= maxTotalSupplyInUsd,
            "surpass-max-total-supply"
        );

        principalOf[_account] += _amount;
        debtIndexOf[_account] = debtIndex;
        emit Transfer(address(0), _account, _amount);

        _addToDebtTokensOfRecipientIfNeeded(_account, _balanceBefore);
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
            pool.addToDebtTokensOfAccount(_recipient);
        }
    }

    function _removeFromDebtTokensOfSenderIfNeeded(address _sender, uint256 _senderBalanceAfter) private {
        if (_senderBalanceAfter == 0) {
            pool.removeFromDebtTokensOfAccount(_sender);
        }
    }

    /**
     * @notice Burn debt token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) external override onlyIfCanBurn {
        _burn(_from, _amount);
    }

    /**
     * @notice Calculate interest to accrue
     * @dev This util function avoids code duplication across `balanceOf` and `accrueInterest`
     * @return _interestAmountAccrued The total amount of debt tokens accrued
     * @return _debtIndex The new `debtIndex` value
     */

    function _calculateInterestAccrual() private view returns (uint256 _interestAmountAccrued, uint256 _debtIndex) {
        if (lastTimestampAccrued == block.timestamp) {
            return (0, debtIndex);
        }

        uint256 _interestRateToAccrue = interestRatePerSecond() * (block.timestamp - lastTimestampAccrued);

        _interestAmountAccrued = _interestRateToAccrue.wadMul(totalSupply_);

        _debtIndex = debtIndex + _interestRateToAccrue.wadMul(debtIndex);
    }

    /**
     * @notice Accrue interest over debt supply
     */
    function accrueInterest() public {
        (uint256 _interestAmountAccrued, uint256 _debtIndex) = _calculateInterestAccrual();

        if (block.timestamp == lastTimestampAccrued) {
            return;
        }

        totalSupply_ += _interestAmountAccrued;
        debtIndex = _debtIndex;
        lastTimestampAccrued = block.timestamp;

        if (_interestAmountAccrued > 0) {
            // Note: We can save some gas by incrementing only and mint all accrued amount later
            syntheticToken.mint(pool.feeCollector(), _interestAmountAccrued);
        }
    }

    /**
     * @notice Lock collateral and mint synthetic token
     * @param _amount The amount to mint
     */
    function issue(uint256 _amount, address _to)
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfSyntheticTokenExists
        onlyIfSyntheticTokenIsActive
    {
        require(_amount > 0, "amount-is-zero");

        accrueInterest();

        (, , , , uint256 _issuableInUsd) = pool.debtPositionOf(msg.sender);

        IMasterOracle _masterOracle = pool.masterOracle();

        require(
            _amount <= _masterOracle.quoteUsdToToken(address(syntheticToken), _issuableInUsd),
            "not-enough-collateral"
        );

        uint256 _debtFloorInUsd = pool.debtFloorInUsd();

        if (_debtFloorInUsd > 0) {
            require(
                _masterOracle.quoteTokenToUsd(address(syntheticToken), balanceOf(msg.sender) + _amount) >=
                    _debtFloorInUsd,
                "debt-lt-floor"
            );
        }

        uint256 _issueFee = pool.issueFee();
        uint256 _amountToIssue = _amount;
        uint256 _feeAmount;
        if (_issueFee > 0) {
            _feeAmount = _amount.wadMul(_issueFee);
            syntheticToken.mint(pool.feeCollector(), _feeAmount);
            _amountToIssue -= _feeAmount;
        }

        syntheticToken.mint(_to, _amountToIssue);
        _mint(msg.sender, _amount);

        emit SyntheticTokenIssued(msg.sender, _to, _amount, _feeAmount);
    }

    /**
     * @notice Send synthetic token to decrease debt
     * @dev The msg.sender is the payer and the account beneficed
     * @param _onBehalfOf The account that will have debt decreased
     * @param _amount The amount of synthetic token to burn (this is the gross amount, the repay fee will be subtracted from it)
     */
    function repay(address _onBehalfOf, uint256 _amount) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");

        accrueInterest();

        uint256 _repayFee = pool.repayFee();
        uint256 _amountToRepay = _amount;
        uint256 _feeAmount;
        if (_repayFee > 0) {
            // Note: `_amountToRepay = _amount - repayFeeAmount`
            _amountToRepay = _amount.wadDiv(1e18 + _repayFee);
            _feeAmount = _amount - _amountToRepay;
            syntheticToken.seize(msg.sender, pool.feeCollector(), _feeAmount);
        }

        uint256 _debtFloorInUsd = pool.debtFloorInUsd();

        if (_debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = pool.masterOracle().quoteTokenToUsd(
                address(syntheticToken),
                balanceOf(_onBehalfOf) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= _debtFloorInUsd, "debt-lt-floor");
        }

        syntheticToken.burn(msg.sender, _amountToRepay);
        _burn(_onBehalfOf, _amountToRepay);

        emit DebtRepaid(msg.sender, _onBehalfOf, _amount, _feeAmount);
    }

    /**
     * @notice Update max total supply (in USD)
     * @param _newMaxTotalSupplyInUsd The new max total supply (in USD)
     */
    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupplyInUsd) external override onlyGovernor {
        uint256 _currentMaxTotalSupplyInUsd = maxTotalSupplyInUsd;
        require(_newMaxTotalSupplyInUsd != _currentMaxTotalSupplyInUsd, "new-same-as-current");
        emit MaxTotalSupplyUpdated(_currentMaxTotalSupplyInUsd, _newMaxTotalSupplyInUsd);
        maxTotalSupplyInUsd = _newMaxTotalSupplyInUsd;
    }

    /**
     * @notice Update interest rate (APR)
     */
    function updateInterestRate(uint256 _newInterestRate) external onlyGovernor {
        accrueInterest();
        uint256 _currentInterestRate = interestRate;
        require(_newInterestRate != _currentInterestRate, "new-same-as-current");
        emit InterestRateUpdated(_currentInterestRate, _newInterestRate);
        interestRate = _newInterestRate;
    }

    /**
     * @notice Enable/Disable the Debt Token
     */
    function toggleIsActive() external override onlyGovernor {
        bool _isActive = isActive;
        emit DebtTokenActiveUpdated(_isActive, !_isActive);
        isActive = !_isActive;
    }
}
