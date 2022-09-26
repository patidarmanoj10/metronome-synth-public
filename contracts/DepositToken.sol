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

    /// @notice Emitted when CR is updated
    event CollateralizationRatioUpdated(uint256 oldCollateralizationRatio, uint256 newCollateralizationRatio);

    /// @notice Emitted when active flag is updated
    event DepositTokenActiveUpdated(bool oldActive, bool newActive);

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupplyInUsd, uint256 newMaxTotalSupplyInUsd);

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(address indexed from, address indexed account, uint256 amount, uint256 fee);

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(address indexed account, address indexed to, uint256 amount, uint256 fee);

    /**
     * @dev Throws if sender can't seize
     */
    modifier onlyIfCanSeize() {
        require(msg.sender == address(pool), "not-pool");
        _;
    }

    /**
     * @notice Requires that amount is lower than the account's unlocked balance
     */
    modifier onlyIfUnlocked(address _account, uint256 _amount) {
        require(unlockedBalanceOf(_account) >= _amount, "not-enough-free-balance");
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
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. mint/burn)
     */
    modifier updateRewardsBeforeMintOrBurn(address _account) {
        IRewardsDistributor[] memory _rewardsDistributors = pool.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeMintOrBurn(this, _account);
        }
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. transfer)
     */
    modifier updateRewardsBeforeTransfer(address _sender, address _recipient) {
        IRewardsDistributor[] memory _rewardsDistributors = pool.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i; i < _length; ++i) {
            _rewardsDistributors[i].updateBeforeTransfer(this, _sender, _recipient);
        }
        _;
    }

    /**
     * @dev Throws if deposit token isn't enabled
     */
    modifier onlyIfDepositTokenIsActive() {
        require(isActive, "deposit-token-is-inactive");
        _;
    }

    function initialize(
        IERC20 _underlying,
        IPool _pool,
        string calldata _symbol,
        uint8 _decimals,
        uint128 _collateralizationRatio,
        uint256 _maxTotalSupplyInUsd
    ) public initializer {
        require(address(_underlying) != address(0), "underlying-is-null");
        require(address(_pool) != address(0), "pool-address-is-zero");
        require(_collateralizationRatio <= 1e18, "collateralization-ratio-gt-100%");

        __Manageable_init();

        pool = _pool;
        name = "Tokenized deposit position";
        symbol = _symbol;
        underlying = _underlying;
        isActive = true;
        decimals = _decimals;
        collateralizationRatio = _collateralizationRatio;
        maxTotalSupplyInUsd = _maxTotalSupplyInUsd;
    }

    function approve(address spender, uint256 _amount) external override returns (bool) {
        _approve(msg.sender, spender, _amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        _approve(msg.sender, spender, allowance[msg.sender][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 currentAllowance = allowance[msg.sender][spender];
        require(currentAllowance >= subtractedValue, "decreased-allowance-below-zero");
        unchecked {
            _approve(msg.sender, spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    function _transfer(
        address _sender,
        address _recipient,
        uint256 _amount
    ) private updateRewardsBeforeTransfer(_sender, _recipient) {
        require(_sender != address(0), "transfer-from-the-zero-address");
        require(_recipient != address(0), "transfer-to-the-zero-address");

        uint256 _senderBalanceBefore = balanceOf[_sender];
        require(_senderBalanceBefore >= _amount, "transfer-amount-exceeds-balance");
        uint256 _recipientBalanceBefore = balanceOf[_recipient];
        uint256 _senderBalanceAfter;

        unchecked {
            _senderBalanceAfter = _senderBalanceBefore - _amount;
        }

        balanceOf[_sender] = _senderBalanceAfter;
        balanceOf[_recipient] = _recipientBalanceBefore + _amount;

        emit Transfer(_sender, _recipient, _amount);

        _addToDepositTokensOfRecipientIfNeeded(_recipient, _recipientBalanceBefore);
        _removeFromDepositTokensOfSenderIfNeeded(_sender, _senderBalanceAfter);
    }

    function _mint(address _account, uint256 _amount)
        private
        onlyIfDepositTokenIsActive
        updateRewardsBeforeMintOrBurn(_account)
    {
        require(_account != address(0), "mint-to-the-zero-address");

        uint256 _newTotalSupplyInUsd = pool.masterOracle().quoteTokenToUsd(address(this), totalSupply + _amount);
        require(_newTotalSupplyInUsd <= maxTotalSupplyInUsd, "surpass-max-total-supply");

        totalSupply += _amount;
        uint256 _balanceBefore = balanceOf[_account];
        balanceOf[_account] = _balanceBefore + _amount;

        emit Transfer(address(0), _account, _amount);

        _addToDepositTokensOfRecipientIfNeeded(_account, _balanceBefore);
    }

    function _burn(address _account, uint256 _amount) private updateRewardsBeforeMintOrBurn(_account) {
        require(_account != address(0), "burn-from-the-zero-address");

        uint256 _balanceBefore = balanceOf[_account];
        require(_balanceBefore >= _amount, "burn-amount-exceeds-balance");
        uint256 _balanceAfter;
        unchecked {
            _balanceAfter = _balanceBefore - _amount;
        }

        balanceOf[_account] = _balanceAfter;
        totalSupply -= _amount;

        emit Transfer(_account, address(0), _amount);

        _removeFromDepositTokensOfSenderIfNeeded(_account, _balanceAfter);
    }

    function _approve(
        address _owner,
        address _spender,
        uint256 _amount
    ) private {
        require(_owner != address(0), "approve-from-the-zero-address");
        require(_spender != address(0), "approve-to-the-zero-address");

        allowance[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function _addToDepositTokensOfRecipientIfNeeded(address _recipient, uint256 _recipientBalanceBefore) private {
        if (_recipientBalanceBefore == 0) {
            pool.addToDepositTokensOfAccount(_recipient);
        }
    }

    function _removeFromDepositTokensOfSenderIfNeeded(address _sender, uint256 _senderBalanceAfter) private {
        if (_senderBalanceAfter == 0) {
            pool.removeFromDepositTokensOfAccount(_sender);
        }
    }

    /**
     * @notice Deposit collateral and mint msdTOKEN (tokenized deposit position)
     * @param _amount The amount of collateral tokens to deposit
     * @param _onBehalfOf The account to deposit to
     */
    function deposit(uint256 _amount, address _onBehalfOf)
        external
        override
        whenNotPaused
        nonReentrant
        onlyIfDepositTokenIsActive
        onlyIfDepositTokenExists
    {
        require(_amount > 0, "amount-is-zero");

        address _treasury = address(pool.treasury());

        uint256 _balanceBefore = underlying.balanceOf(_treasury);

        underlying.safeTransferFrom(msg.sender, _treasury, _amount);

        _amount = underlying.balanceOf(_treasury) - _balanceBefore;

        uint256 _depositFee = pool.depositFee();
        uint256 _amountToDeposit = _amount;
        uint256 _feeAmount;
        if (_depositFee > 0) {
            _feeAmount = _amount.wadMul(_depositFee);
            _mint(pool.feeCollector(), _feeAmount);
            _amountToDeposit -= _feeAmount;
        }

        _mint(_onBehalfOf, _amountToDeposit);

        emit CollateralDeposited(msg.sender, _onBehalfOf, _amount, _feeAmount);
    }

    /**
     * @notice Burn msdTOKEN and withdraw collateral
     * @param _amount The amount of collateral to withdraw
     * @param _to The account that will receive withdrawn collateral
     */
    function withdraw(uint256 _amount, address _to)
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists
    {
        require(_amount > 0, "amount-is-zero");

        require(_amount <= unlockedBalanceOf(msg.sender), "amount-gt-unlocked");

        uint256 _withdrawFee = pool.withdrawFee();
        uint256 _amountToWithdraw = _amount;
        uint256 _feeAmount;
        if (_withdrawFee > 0) {
            _feeAmount = _amount.wadMul(_withdrawFee);
            _transfer(msg.sender, pool.feeCollector(), _feeAmount);
            _amountToWithdraw -= _feeAmount;
        }

        _burnForWithdraw(msg.sender, _amountToWithdraw);
        pool.treasury().pull(_to, _amountToWithdraw);

        emit CollateralWithdrawn(msg.sender, _to, _amount, _feeAmount);
    }

    /**
     * @notice Burn deposit token as part of withdraw process
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function _burnForWithdraw(address _from, uint256 _amount) private {
        _burn(_from, _amount);
    }

    function transfer(address _to, uint256 _amount)
        external
        override
        onlyIfUnlocked(msg.sender, _amount)
        returns (bool)
    {
        _transfer(msg.sender, _to, _amount);
        return true;
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) external override nonReentrant onlyIfUnlocked(_sender, _amount) returns (bool) {
        _transfer(_sender, _recipient, _amount);

        uint256 currentAllowance = allowance[_sender][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= _amount, "amount-exceeds-allowance");
            unchecked {
                _approve(_sender, msg.sender, currentAllowance - _amount);
            }
        }

        return true;
    }

    /**
     * @notice Get the unlocked balance (i.e. transferable, withdrawable)
     * @param _account The account to check
     * @return _unlockedBalance The amount that user can transfer or withdraw
     */
    function unlockedBalanceOf(address _account) public view override returns (uint256 _unlockedBalance) {
        (, , , , uint256 _issuableInUsd) = pool.debtPositionOf(_account);

        if (_issuableInUsd > 0) {
            _unlockedBalance = Math.min(
                balanceOf[_account],
                pool.masterOracle().quoteUsdToToken(address(this), _issuableInUsd.wadDiv(collateralizationRatio))
            );
        }
    }

    /**
     * @notice Get the locked balance
     * @param _account The account to check
     * @return _lockedBalance The locked amount
     */
    function lockedBalanceOf(address _account) external view override returns (uint256 _lockedBalance) {
        unchecked {
            return balanceOf[_account] - unlockedBalanceOf(_account);
        }
    }

    /**
     * @notice Seize tokens
     * @dev Same as _transfer
     * @param _from The account to seize from
     * @param _to The beneficiary account
     * @param _amount The amount to seize
     */
    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external override onlyIfCanSeize {
        _transfer(_from, _to, _amount);
    }

    /**
     * @notice Update collateralization ratio
     * @param _newCollateralizationRatio The new CR value
     */
    function updateCollateralizationRatio(uint128 _newCollateralizationRatio) external override onlyGovernor {
        require(_newCollateralizationRatio <= 1e18, "collateralization-ratio-gt-100%");
        uint256 _currentCollateralizationRatio = collateralizationRatio;
        require(_newCollateralizationRatio != _currentCollateralizationRatio, "new-same-as-current");
        emit CollateralizationRatioUpdated(_currentCollateralizationRatio, _newCollateralizationRatio);
        collateralizationRatio = _newCollateralizationRatio;
    }

    /**
     * @notice Update max total supply
     * @param _newMaxTotalSupplyInUsd The new max total supply
     */
    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupplyInUsd) external override onlyGovernor {
        uint256 _currentMaxTotalSupplyInUsd = maxTotalSupplyInUsd;
        require(_newMaxTotalSupplyInUsd != _currentMaxTotalSupplyInUsd, "new-same-as-current");
        emit MaxTotalSupplyUpdated(_currentMaxTotalSupplyInUsd, _newMaxTotalSupplyInUsd);
        maxTotalSupplyInUsd = _newMaxTotalSupplyInUsd;
    }

    /**
     * @notice Enable/Disable the Deposit Token
     */
    function toggleIsActive() external override onlyGovernor {
        bool _isActive = isActive;
        emit DepositTokenActiveUpdated(_isActive, !_isActive);
        isActive = !_isActive;
    }
}
