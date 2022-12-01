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

    uint256 public constant SECONDS_PER_YEAR = 365.25 days;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when synthetic's debt is repaid
    event DebtRepaid(address indexed payer, address indexed account, uint256 amount, uint256 repaid, uint256 fee);

    /// @notice Emitted when active flag is updated
    event DebtTokenActiveUpdated(bool newActive);

    /// @notice Emitted when interest rate is updated
    event InterestRateUpdated(uint256 oldInterestRate, uint256 newInterestRate);

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupply, uint256 newMaxTotalSupply);

    /// @notice Emitted when synthetic token is issued
    event SyntheticTokenIssued(
        address indexed account,
        address indexed to,
        uint256 amount,
        uint256 issued,
        uint256 fee
    );

    /**
     * @dev Throws if sender can't burn
     */
    modifier onlyIfCanBurn() {
        require(msg.sender == address(pool), "not-pool");
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
     * @dev Throws if synthetic token isn't enabled
     */
    modifier onlyIfSyntheticTokenIsActive() {
        require(syntheticToken.isActive(), "synthetic-inactive");
        require(isActive, "debt-token-inactive");
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. mint/burn)
     */
    modifier updateRewardsBeforeMintOrBurn(address account_) {
        IRewardsDistributor[] memory _rewardsDistributors = pool.getRewardsDistributors();
        ISyntheticToken _syntheticToken = syntheticToken;
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeMintOrBurn(_syntheticToken, account_);
        }
        _;
    }

    function initialize(
        string calldata name_,
        string calldata symbol_,
        IPool pool_,
        ISyntheticToken syntheticToken_,
        uint256 interestRate_,
        uint256 maxTotalSupply_
    ) external initializer {
        require(bytes(name_).length > 0, "empty-name");
        require(bytes(symbol_).length > 0, "empty-symbol");
        require(address(pool_) != address(0), "pool-is-null");
        require(address(syntheticToken_) != address(0), "synthetic-is-null");

        __ReentrancyGuard_init();
        __Manageable_init(pool_);

        name = name_;
        symbol = symbol_;
        decimals = syntheticToken_.decimals();
        syntheticToken = syntheticToken_;
        lastTimestampAccrued = block.timestamp;
        debtIndex = 1e18;
        interestRate = interestRate_;
        maxTotalSupply = maxTotalSupply_;
        isActive = true;
    }

    /**
     * @notice Accrue interest over debt supply
     */
    function accrueInterest() public override {
        (
            uint256 _interestAmountAccrued,
            uint256 _debtIndex,
            uint256 _lastTimestampAccrued
        ) = _calculateInterestAccrual();

        if (block.timestamp == _lastTimestampAccrued) {
            return;
        }

        lastTimestampAccrued = block.timestamp;

        if (_interestAmountAccrued > 0) {
            totalSupply_ += _interestAmountAccrued;
            debtIndex = _debtIndex;
            // Note: We could save gas by having an accumulator and a function to mint accumulated fee
            syntheticToken.mint(pool.feeCollector(), _interestAmountAccrued);
        }
    }

    function allowance(
        address, /*owner_*/
        address /*spender_*/
    ) external pure override returns (uint256) {
        revert("allowance-not-supported");
    }

    // solhint-disable-next-line
    function approve(
        address, /*spender_*/
        uint256 /*amount_*/
    ) external override returns (bool) {
        revert("approval-not-supported");
    }

    /**
     * @notice Get the updated (principal + interest) user's debt
     */
    function balanceOf(address account_) public view override returns (uint256) {
        uint256 _principal = principalOf[account_];
        if (_principal == 0) {
            return 0;
        }

        (, uint256 _debtIndex, ) = _calculateInterestAccrual();

        // Note: The `debtIndex / debtIndexOf` gives the interest to apply to the principal amount
        return (_principal * _debtIndex) / debtIndexOf[account_];
    }

    /**
     * @notice Burn debt token
     * @param from_ The account to burn from
     * @param amount_ The amount to burn
     */
    function burn(address from_, uint256 amount_) external override onlyIfCanBurn {
        _burn(from_, amount_);
    }

    /**
     * @notice Lock collateral and mint synthetic token
     * @param amount_ The amount to mint
     * @param to_ The beneficiary account
     * @return _issued The amount issued after fees
     * @return _fee The fee amount collected
     */
    function issue(uint256 amount_, address to_)
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfSyntheticTokenExists
        onlyIfSyntheticTokenIsActive
        returns (uint256 _issued, uint256 _fee)
    {
        require(amount_ > 0, "amount-is-zero");

        accrueInterest();

        IPool _pool = pool;
        ISyntheticToken _syntheticToken = syntheticToken;

        (, , , , uint256 _issuableInUsd) = _pool.debtPositionOf(msg.sender);

        IMasterOracle _masterOracle = _pool.masterOracle();

        require(
            amount_ <= _masterOracle.quoteUsdToToken(address(_syntheticToken), _issuableInUsd),
            "not-enough-collateral"
        );

        uint256 _debtFloorInUsd = _pool.debtFloorInUsd();

        if (_debtFloorInUsd > 0) {
            require(
                _masterOracle.quoteTokenToUsd(address(_syntheticToken), balanceOf(msg.sender) + amount_) >=
                    _debtFloorInUsd,
                "debt-lt-floor"
            );
        }

        (_issued, _fee) = quoteIssueOut(amount_);
        if (_fee > 0) {
            _syntheticToken.mint(_pool.feeCollector(), _fee);
        }

        _syntheticToken.mint(to_, _issued);
        _mint(msg.sender, amount_);

        emit SyntheticTokenIssued(msg.sender, to_, amount_, _issued, _fee);
    }

    /**
     * @notice Return interest rate (in percent) per second
     */
    function interestRatePerSecond() public view override returns (uint256) {
        return interestRate / SECONDS_PER_YEAR;
    }

    /**
     * @notice Quote gross `_amount` to issue `amountToIssue_` synthetic tokens
     * @param amountToIssue_ Synth to issue
     * @return _amount Gross amount
     * @return _fee The fee amount to collect
     */
    function quoteIssueIn(uint256 amountToIssue_) external view override returns (uint256 _amount, uint256 _fee) {
        uint256 _issueFee = pool.issueFee();
        if (_issueFee == 0) {
            return (amountToIssue_, _fee);
        }

        _amount = amountToIssue_.wadDiv(1e18 - _issueFee);
        _fee = _amount - amountToIssue_;
    }

    /**
     * @notice Quote synthetic tokens `_amountToIssue` by using gross `_amount`
     * @param amount_ Gross amount
     * @return _amountToIssue Synth to issue
     * @return _fee The fee amount to collect
     */
    function quoteIssueOut(uint256 amount_) public view override returns (uint256 _amountToIssue, uint256 _fee) {
        uint256 _issueFee = pool.issueFee();
        if (_issueFee == 0) {
            return (amount_, _fee);
        }

        _fee = amount_.wadMul(_issueFee);
        _amountToIssue = amount_ - _fee;
    }

    /**
     * @notice Quote synthetic token `_amount` need to repay `amountToRepay_` debt
     * @param amountToRepay_ Debt amount to repay
     * @return _amount Gross amount
     * @return _fee The fee amount to collect
     */
    function quoteRepayIn(uint256 amountToRepay_) public view override returns (uint256 _amount, uint256 _fee) {
        uint256 _repayFee = pool.repayFee();
        if (_repayFee == 0) {
            return (amountToRepay_, _fee);
        }

        _fee = amountToRepay_.wadMul(_repayFee);
        _amount = amountToRepay_ + _fee;
    }

    /**
     * @notice Quote debt `_amountToRepay` by burning `_amount` synthetic tokens
     * @param amount_ Gross amount
     * @return _amountToRepay Debt amount to repay
     * @return _fee The fee amount to collect
     */
    function quoteRepayOut(uint256 amount_) public view override returns (uint256 _amountToRepay, uint256 _fee) {
        uint256 _repayFee = pool.repayFee();
        if (_repayFee == 0) {
            return (amount_, _fee);
        }

        _amountToRepay = amount_.wadDiv(1e18 + _repayFee);
        _fee = amount_ - _amountToRepay;
    }

    /**
     * @notice Send synthetic token to decrease debt
     * @dev The msg.sender is the payer and the account beneficed
     * @param onBehalfOf_ The account that will have debt decreased
     * @param amount_ The amount of synthetic token to burn (this is the gross amount, the repay fee will be subtracted from it)
     * @return _repaid The amount repaid after fees
     */
    function repay(address onBehalfOf_, uint256 amount_)
        external
        override
        whenNotShutdown
        nonReentrant
        returns (uint256 _repaid, uint256 _fee)
    {
        require(amount_ > 0, "amount-is-zero");

        accrueInterest();

        IPool _pool = pool;
        ISyntheticToken _syntheticToken = syntheticToken;

        (_repaid, _fee) = quoteRepayOut(amount_);
        if (_fee > 0) {
            _syntheticToken.seize(msg.sender, _pool.feeCollector(), _fee);
        }

        uint256 _debtFloorInUsd = _pool.debtFloorInUsd();
        if (_debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = _pool.masterOracle().quoteTokenToUsd(
                address(_syntheticToken),
                balanceOf(onBehalfOf_) - _repaid
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= _debtFloorInUsd, "debt-lt-floor");
        }

        _syntheticToken.burn(msg.sender, _repaid);
        _burn(onBehalfOf_, _repaid);

        emit DebtRepaid(msg.sender, onBehalfOf_, amount_, _repaid, _fee);
    }

    /**
     * @notice Send synthetic token to decrease debt
     * @dev This function helps users to no leave debt dust behind
     * @param onBehalfOf_ The account that will have debt decreased
     * @return _repaid The amount repaid after fees
     * @return _fee The fee amount collected
     */
    function repayAll(address onBehalfOf_)
        external
        override
        whenNotShutdown
        nonReentrant
        returns (uint256 _repaid, uint256 _fee)
    {
        accrueInterest();

        _repaid = balanceOf(onBehalfOf_);
        require(_repaid > 0, "amount-is-zero");

        ISyntheticToken _syntheticToken = syntheticToken;

        uint256 _amount;
        (_amount, _fee) = quoteRepayIn(_repaid);

        if (_fee > 0) {
            _syntheticToken.seize(msg.sender, pool.feeCollector(), _fee);
        }

        _syntheticToken.burn(msg.sender, _repaid);
        _burn(onBehalfOf_, _repaid);

        emit DebtRepaid(msg.sender, onBehalfOf_, _amount, _repaid, _fee);
    }

    /**
     * @notice Return the total supply
     */
    function totalSupply() external view override returns (uint256) {
        (uint256 _interestAmountAccrued, , ) = _calculateInterestAccrual();
        return totalSupply_ + _interestAmountAccrued;
    }

    // solhint-disable-next-line
    function transfer(
        address, /*recipient_*/
        uint256 /*amount_*/
    ) external override returns (bool) {
        revert("transfer-not-supported");
    }

    // solhint-disable-next-line
    function transferFrom(
        address, /*sender_*/
        address, /*recipient_*/
        uint256 /*amount_*/
    ) external override returns (bool) {
        revert("transfer-not-supported");
    }

    /**
     * @notice Add this token to the debt tokens list if the recipient is receiving it for the 1st time
     */
    function _addToDebtTokensOfRecipientIfNeeded(address recipient_, uint256 recipientBalanceBefore_) private {
        if (recipientBalanceBefore_ == 0) {
            pool.addToDebtTokensOfAccount(recipient_);
        }
    }

    /**
     * @notice Destroy `amount` tokens from `account`, reducing the
     * total supply
     */
    function _burn(address account_, uint256 amount_) private updateRewardsBeforeMintOrBurn(account_) {
        require(account_ != address(0), "burn-from-the-zero-address");

        uint256 _accountBalance = balanceOf(account_);
        require(_accountBalance >= amount_, "burn-amount-exceeds-balance");

        unchecked {
            principalOf[account_] = _accountBalance - amount_;
            debtIndexOf[account_] = debtIndex;
            totalSupply_ -= amount_;
        }

        emit Transfer(account_, address(0), amount_);

        _removeFromDebtTokensOfSenderIfNeeded(account_, balanceOf(account_));
    }

    /**
     * @notice Calculate interest to accrue
     * @dev This util function avoids code duplication across `balanceOf` and `accrueInterest`
     * @return _interestAmountAccrued The total amount of debt tokens accrued
     * @return _debtIndex The new `debtIndex` value
     */
    function _calculateInterestAccrual()
        private
        view
        returns (
            uint256 _interestAmountAccrued,
            uint256 _debtIndex,
            uint256 _lastTimestampAccrued
        )
    {
        _lastTimestampAccrued = lastTimestampAccrued;
        _debtIndex = debtIndex;

        if (block.timestamp > _lastTimestampAccrued) {
            uint256 _interestRateToAccrue = interestRatePerSecond() * (block.timestamp - _lastTimestampAccrued);
            if (_interestRateToAccrue > 0) {
                _interestAmountAccrued = _interestRateToAccrue.wadMul(totalSupply_);
                _debtIndex += _interestRateToAccrue.wadMul(debtIndex);
            }
        }
    }

    /**
     * @notice Create `amount` tokens and assigns them to `account`, increasing
     * the total supply
     */
    function _mint(address account_, uint256 amount_) private updateRewardsBeforeMintOrBurn(account_) {
        require(account_ != address(0), "mint-to-the-zero-address");

        uint256 _balanceBefore = balanceOf(account_);

        totalSupply_ += amount_;
        require(totalSupply_ <= maxTotalSupply, "surpass-max-debt-supply");

        principalOf[account_] += amount_;
        debtIndexOf[account_] = debtIndex;
        emit Transfer(address(0), account_, amount_);

        _addToDebtTokensOfRecipientIfNeeded(account_, _balanceBefore);
    }

    /**
     * @notice Remove this token to the debt tokens list if the sender's balance goes to zero
     */
    function _removeFromDebtTokensOfSenderIfNeeded(address sender_, uint256 senderBalanceAfter_) private {
        if (senderBalanceAfter_ == 0) {
            pool.removeFromDebtTokensOfAccount(sender_);
        }
    }

    /**
     * @notice Update max total supply
     */
    function updateMaxTotalSupply(uint256 newMaxTotalSupply_) external override onlyGovernor {
        uint256 _currentMaxTotalSupply = maxTotalSupply;
        require(newMaxTotalSupply_ != _currentMaxTotalSupply, "new-same-as-current");
        emit MaxTotalSupplyUpdated(_currentMaxTotalSupply, newMaxTotalSupply_);
        maxTotalSupply = newMaxTotalSupply_;
    }

    /**
     * @notice Update interest rate (APR)
     */
    function updateInterestRate(uint256 newInterestRate_) external override onlyGovernor {
        accrueInterest();
        uint256 _currentInterestRate = interestRate;
        require(newInterestRate_ != _currentInterestRate, "new-same-as-current");
        emit InterestRateUpdated(_currentInterestRate, newInterestRate_);
        interestRate = newInterestRate_;
    }

    /**
     * @notice Enable/Disable the Debt Token
     */
    function toggleIsActive() external override onlyGovernor {
        bool _newIsActive = !isActive;
        emit DebtTokenActiveUpdated(_newIsActive);
        isActive = _newIsActive;
    }
}
