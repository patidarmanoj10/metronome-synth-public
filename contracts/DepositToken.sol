// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/utils/math/Math.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./lib/WadRayMath.sol";
import "./access/Manageable.sol";
import "./storage/DepositTokenStorage.sol";

/**
 * @title Represents the users' deposits
 */
contract DepositToken is ReentrancyGuard, Manageable, DepositTokenStorageV1 {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(
        address indexed from,
        address indexed account,
        uint256 amount,
        uint256 deposited,
        uint256 fee
    );

    /// @notice Emitted when CF is updated
    event CollateralFactorUpdated(uint256 oldCollateralFactor, uint256 newCollateralFactor);

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(
        address indexed account,
        address indexed to,
        uint256 amount,
        uint256 withdrawn,
        uint256 fee
    );

    /// @notice Emitted when active flag is updated
    event DepositTokenActiveUpdated(bool newActive);

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupply, uint256 newMaxTotalSupply);

    /**
     * @dev Throws if sender can't seize
     */
    modifier onlyIfCanSeize() {
        require(msg.sender == address(pool), "not-pool");
        _;
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    modifier onlyIfDepositTokenExists() {
        require(pool.isDepositTokenExists(this), "collateral-inexistent");
        _;
    }

    /**
     * @dev Throws if deposit token isn't enabled
     */
    modifier onlyIfDepositTokenIsActive() {
        require(isActive, "deposit-token-inactive");
        _;
    }

    /**
     * @notice Requires that amount is lower than the account's unlocked balance
     */
    modifier onlyIfUnlocked(address account_, uint256 amount_) {
        require(unlockedBalanceOf(account_) >= amount_, "not-enough-free-balance");
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. mint/burn)
     */
    modifier updateRewardsBeforeMintOrBurn(address account_) {
        IRewardsDistributor[] memory _rewardsDistributors = pool.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeMintOrBurn(this, account_);
        }
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. transfer)
     */
    modifier updateRewardsBeforeTransfer(address sender_, address recipient_) {
        IRewardsDistributor[] memory _rewardsDistributors = pool.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeTransfer(this, sender_, recipient_);
        }
        _;
    }

    function initialize(
        IERC20 underlying_,
        IPool pool_,
        string calldata name_,
        string calldata symbol_,
        uint8 decimals_,
        uint128 collateralFactor_,
        uint256 maxTotalSupply_
    ) external initializer {
        require(address(underlying_) != address(0), "underlying-is-null");
        require(collateralFactor_ <= 1e18, "collateral-factor-gt-100%");

        __ReentrancyGuard_init();
        __Manageable_init(pool_);

        name = name_;
        symbol = symbol_;
        underlying = underlying_;
        isActive = true;
        decimals = decimals_;
        collateralFactor = collateralFactor_;
        maxTotalSupply = maxTotalSupply_;
    }

    /**
     * @notice Set `amount` as the allowance of `spender` over the caller's tokens
     */
    function approve(address spender_, uint256 amount_) external override returns (bool) {
        _approve(msg.sender, spender_, amount_);
        return true;
    }

    /**
     * @notice Atomically decrease the allowance granted to `spender` by the caller
     */
    function decreaseAllowance(address spender_, uint256 subtractedValue_) external returns (bool) {
        uint256 _currentAllowance = allowance[msg.sender][spender_];
        require(_currentAllowance >= subtractedValue_, "decreased-allowance-below-zero");
        unchecked {
            _approve(msg.sender, spender_, _currentAllowance - subtractedValue_);
        }
        return true;
    }

    /**
     * @notice Deposit collateral and mint msdTOKEN (tokenized deposit position)
     * @param amount_ The amount of collateral tokens to deposit
     * @param onBehalfOf_ The account to deposit to
     * @return _deposited The amount deposited after fees
     */
    function deposit(uint256 amount_, address onBehalfOf_)
        external
        override
        whenNotPaused
        nonReentrant
        onlyIfDepositTokenIsActive
        onlyIfDepositTokenExists
        returns (uint256 _deposited, uint256 _fee)
    {
        require(amount_ > 0, "amount-is-zero");

        IPool _pool = pool;
        IERC20 _underlying = underlying;

        address _treasury = address(_pool.treasury());

        uint256 _balanceBefore = _underlying.balanceOf(_treasury);
        _underlying.safeTransferFrom(msg.sender, _treasury, amount_);
        amount_ = _underlying.balanceOf(_treasury) - _balanceBefore;

        (_deposited, _fee) = quoteDepositOut(amount_);
        if (_fee > 0) {
            _mint(_pool.feeCollector(), _fee);
        }

        _mint(onBehalfOf_, _deposited);

        emit CollateralDeposited(msg.sender, onBehalfOf_, amount_, _deposited, _fee);
    }

    /**
     * @notice Atomically increase the allowance granted to `spender` by the caller
     */
    function increaseAllowance(address spender_, uint256 addedValue_) external returns (bool) {
        _approve(msg.sender, spender_, allowance[msg.sender][spender_] + addedValue_);
        return true;
    }

    /**
     * @notice Get the locked balance
     * @param account_ The account to check
     * @return _lockedBalance The locked amount
     */
    function lockedBalanceOf(address account_) external view override returns (uint256 _lockedBalance) {
        unchecked {
            return balanceOf[account_] - unlockedBalanceOf(account_);
        }
    }

    /**
     * @notice Quote gross `_amount` to deposit `amountToDeposit_` collateral
     * @param amountToDeposit_ Collateral to deposit
     * @return _amount Gross amount
     * @return _fee Fee amount to collect
     */
    function quoteDepositIn(uint256 amountToDeposit_) external view override returns (uint256 _amount, uint256 _fee) {
        uint256 _depositFee = pool.depositFee();
        if (_depositFee == 0) {
            return (amountToDeposit_, _fee);
        }

        _amount = amountToDeposit_.wadDiv(1e18 - _depositFee);
        _fee = _amount - amountToDeposit_;
    }

    /**
     * @notice Quote collateral `_amountToDeposit` by using gross `amount_`
     * @param amount_ Gross amount
     * @return _amountToDeposit Collateral to deposit
     * @return _fee Fee amount to collect
     */
    function quoteDepositOut(uint256 amount_) public view override returns (uint256 _amountToDeposit, uint256 _fee) {
        uint256 _depositFee = pool.depositFee();
        if (_depositFee == 0) {
            return (amount_, _fee);
        }

        _fee = amount_.wadMul(_depositFee);
        _amountToDeposit = amount_ - _fee;
    }

    /**
     * @notice Quote gross `_amount` to withdraw `amountToWithdraw_` collateral
     * @param amountToWithdraw_ Collateral to withdraw
     * @return _amount Gross amount
     * @return _fee Fee amount to collect
     */
    function quoteWithdrawIn(uint256 amountToWithdraw_) external view override returns (uint256 _amount, uint256 _fee) {
        uint256 _withdrawFee = pool.withdrawFee();
        if (_withdrawFee == 0) {
            return (amountToWithdraw_, _fee);
        }

        _amount = amountToWithdraw_.wadDiv(1e18 - _withdrawFee);
        _fee = _amount - amountToWithdraw_;
    }

    /**
     * @notice Quote collateral `_amountToWithdraw` by using gross `_amount`
     * @param amount_ Gross amount
     * @return _amountToWithdraw Collateral to withdraw
     * @return _fee Fee amount to collect
     */
    function quoteWithdrawOut(uint256 amount_) public view override returns (uint256 _amountToWithdraw, uint256 _fee) {
        uint256 _withdrawFee = pool.withdrawFee();
        if (_withdrawFee == 0) {
            return (amount_, _fee);
        }

        _fee = amount_.wadMul(_withdrawFee);
        _amountToWithdraw = amount_ - _fee;
    }

    /**
     * @notice Seize tokens
     * @dev Same as _transfer
     * @param from_ The account to seize from
     * @param to_ The beneficiary account
     * @param amount_ The amount to seize
     */
    function seize(
        address from_,
        address to_,
        uint256 amount_
    ) external override onlyIfCanSeize {
        _transfer(from_, to_, amount_);
    }

    /**
     * @notice Move `amount` tokens from the caller's account to `recipient`
     */
    function transfer(address to_, uint256 amount_)
        external
        override
        onlyIfUnlocked(msg.sender, amount_)
        returns (bool)
    {
        _transfer(msg.sender, to_, amount_);
        return true;
    }

    /**
     * @notice Move `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance
     */
    function transferFrom(
        address sender_,
        address recipient_,
        uint256 amount_
    ) external override nonReentrant onlyIfUnlocked(sender_, amount_) returns (bool) {
        _transfer(sender_, recipient_, amount_);

        uint256 _currentAllowance = allowance[sender_][msg.sender];
        if (_currentAllowance != type(uint256).max) {
            require(_currentAllowance >= amount_, "amount-exceeds-allowance");
            unchecked {
                _approve(sender_, msg.sender, _currentAllowance - amount_);
            }
        }

        return true;
    }

    /**
     * @notice Get the unlocked balance (i.e. transferable, withdrawable)
     * @param account_ The account to check
     * @return _unlockedBalance The amount that user can transfer or withdraw
     */
    function unlockedBalanceOf(address account_) public view override returns (uint256 _unlockedBalance) {
        IPool _pool = pool;

        (, , , , uint256 _issuableInUsd) = _pool.debtPositionOf(account_);

        if (_issuableInUsd > 0) {
            _unlockedBalance = Math.min(
                balanceOf[account_],
                _pool.masterOracle().quoteUsdToToken(address(underlying), _issuableInUsd.wadDiv(collateralFactor))
            );
        }
    }

    /**
     * @notice Burn msdTOKEN and withdraw collateral
     * @param amount_ The amount of collateral to withdraw
     * @param to_ The account that will receive withdrawn collateral
     * @return _withdrawn The amount withdrawn after fees
     */
    function withdraw(uint256 amount_, address to_)
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists
        returns (uint256 _withdrawn, uint256 _fee)
    {
        require(amount_ > 0 && amount_ <= unlockedBalanceOf(msg.sender), "amount-is-invalid");

        IPool _pool = pool;

        (_withdrawn, _fee) = quoteWithdrawOut(amount_);
        if (_fee > 0) {
            _transfer(msg.sender, _pool.feeCollector(), _fee);
        }

        _burn(msg.sender, _withdrawn);
        _pool.treasury().pull(to_, _withdrawn);

        emit CollateralWithdrawn(msg.sender, to_, amount_, _withdrawn, _fee);
    }

    /**
     * @notice Add this token to the deposit tokens list if the recipient is receiving it for the 1st time
     */
    function _addToDepositTokensOfRecipientIfNeeded(address recipient_, uint256 recipientBalanceBefore_) private {
        if (recipientBalanceBefore_ == 0) {
            pool.addToDepositTokensOfAccount(recipient_);
        }
    }

    /**
     * @notice Set `amount` as the allowance of `spender` over the caller's tokens
     */
    function _approve(
        address owner_,
        address spender_,
        uint256 amount_
    ) private {
        require(owner_ != address(0), "approve-from-the-zero-address");
        require(spender_ != address(0), "approve-to-the-zero-address");

        allowance[owner_][spender_] = amount_;
        emit Approval(owner_, spender_, amount_);
    }

    /**
     * @notice Destroy `amount` tokens from `account`, reducing the
     * total supply
     */
    function _burn(address _account, uint256 _amount) private updateRewardsBeforeMintOrBurn(_account) {
        require(_account != address(0), "burn-from-the-zero-address");

        uint256 _balanceBefore = balanceOf[_account];
        require(_balanceBefore >= _amount, "burn-amount-exceeds-balance");
        uint256 _balanceAfter;
        unchecked {
            _balanceAfter = _balanceBefore - _amount;
            totalSupply -= _amount;
        }

        balanceOf[_account] = _balanceAfter;

        emit Transfer(_account, address(0), _amount);

        _removeFromDepositTokensOfSenderIfNeeded(_account, _balanceAfter);
    }

    /**
     * @notice Create `amount` tokens and assigns them to `account`, increasing
     * the total supply
     */
    function _mint(address account_, uint256 amount_)
        private
        onlyIfDepositTokenIsActive
        updateRewardsBeforeMintOrBurn(account_)
    {
        require(account_ != address(0), "mint-to-the-zero-address");

        totalSupply += amount_;
        require(totalSupply <= maxTotalSupply, "surpass-max-deposit-supply");

        uint256 _balanceBefore = balanceOf[account_];
        unchecked {
            balanceOf[account_] = _balanceBefore + amount_;
        }

        emit Transfer(address(0), account_, amount_);

        _addToDepositTokensOfRecipientIfNeeded(account_, _balanceBefore);
    }

    /**
     * @notice Remove this token to the deposit tokens list if the sender's balance goes to zero
     */
    function _removeFromDepositTokensOfSenderIfNeeded(address sender_, uint256 senderBalanceAfter_) private {
        if (senderBalanceAfter_ == 0) {
            pool.removeFromDepositTokensOfAccount(sender_);
        }
    }

    /**
     * @notice Move `amount` of tokens from `sender` to `recipient`
     */
    function _transfer(
        address sender_,
        address recipient_,
        uint256 amount_
    ) private updateRewardsBeforeTransfer(sender_, recipient_) {
        require(sender_ != address(0), "transfer-from-the-zero-address");
        require(recipient_ != address(0), "transfer-to-the-zero-address");

        uint256 _senderBalanceBefore = balanceOf[sender_];
        require(_senderBalanceBefore >= amount_, "transfer-amount-exceeds-balance");
        uint256 _recipientBalanceBefore = balanceOf[recipient_];
        uint256 _senderBalanceAfter;

        unchecked {
            _senderBalanceAfter = _senderBalanceBefore - amount_;
            balanceOf[recipient_] = _recipientBalanceBefore + amount_;
        }

        balanceOf[sender_] = _senderBalanceAfter;

        emit Transfer(sender_, recipient_, amount_);

        _addToDepositTokensOfRecipientIfNeeded(recipient_, _recipientBalanceBefore);
        _removeFromDepositTokensOfSenderIfNeeded(sender_, _senderBalanceAfter);
    }

    /**
     * @notice Enable/Disable the Deposit Token
     */
    function toggleIsActive() external override onlyGovernor {
        bool _newIsActive = !isActive;
        emit DepositTokenActiveUpdated(_newIsActive);
        isActive = _newIsActive;
    }

    /**
     * @notice Update collateral factor
     * @param newCollateralFactor_ The new CF value
     */
    function updateCollateralFactor(uint128 newCollateralFactor_) external override onlyGovernor {
        require(newCollateralFactor_ <= 1e18, "collateral-factor-gt-100%");
        uint256 _currentCollateralFactor = collateralFactor;
        require(newCollateralFactor_ != _currentCollateralFactor, "new-same-as-current");
        emit CollateralFactorUpdated(_currentCollateralFactor, newCollateralFactor_);
        collateralFactor = newCollateralFactor_;
    }

    /**
     * @notice Update max total supply
     * @param newMaxTotalSupply_ The new max total supply
     */
    function updateMaxTotalSupply(uint256 newMaxTotalSupply_) external override onlyGovernor {
        uint256 _currentMaxTotalSupply = maxTotalSupply;
        require(newMaxTotalSupply_ != _currentMaxTotalSupply, "new-same-as-current");
        emit MaxTotalSupplyUpdated(_currentMaxTotalSupply, newMaxTotalSupply_);
        maxTotalSupply = newMaxTotalSupply_;
    }
}
