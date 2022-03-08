// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
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

    /// @notice Emitted when minimum deposit time is updated
    event MinDepositTimeUpdated(uint256 oldMinDepositTime, uint256 newMinDepositTime);

    /// @notice Emitted when active flag is updated
    event DepositTokenActiveUpdated(bool oldActive, bool newActive);

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupplyInUsd, uint256 newMaxTotalSupplyInUsd);

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(address indexed from, address indexed account, uint256 amount, uint256 fee);

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(address indexed account, address indexed to, uint256 amount, uint256 fee);

    /**
     * @dev Throws if minimum deposit time haven't passed
     */
    modifier onlyIfMinDepositTimePassed(address _account) {
        require(block.timestamp >= lastDepositOf[_account] + minDepositTime, "min-deposit-time-have-not-passed");
        _;
    }

    /**
     * @notice Requires that amount is lower than the account's unlocked balance
     */
    modifier onlyIfNotLocked(address _account, uint256 _amount) {
        uint256 _unlockedDeposit = unlockedBalanceOf(_account);
        require(_unlockedDeposit >= _amount, "not-enough-free-balance");
        _;
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    modifier onlyIfDepositTokenExists() {
        require(controller.isDepositTokenExists(this), "collateral-inexistent");
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. mint/burn)
     */
    modifier updateRewardsBeforeMintOrBurn(address _account) {
        IRewardsDistributor[] memory _rewardsDistributors = controller.getRewardsDistributors();
        for (uint256 i = 0; i < _rewardsDistributors.length; i++) {
            _rewardsDistributors[i].updateBeforeMintOrBurn(this, _account);
        }
        _;
    }

    /**
     * @notice Update reward contracts' states
     * @dev Should be called before balance changes (i.e. transfer)
     */
    modifier updateRewardsBeforeTransfer(address _sender, address _recipient) {
        IRewardsDistributor[] memory _rewardsDistributors = controller.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i = 0; i < _length; i++) {
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
        IController _controller,
        string memory _symbol,
        uint8 _decimals,
        uint128 _collateralizationRatio
    ) public initializer {
        require(address(_underlying) != address(0), "underlying-is-null");
        require(address(_controller) != address(0), "controller-address-is-zero");
        require(_collateralizationRatio <= 1e18, "collaterization-ratio-gt-100%");

        __Manageable_init();

        controller = _controller;
        name = "Tokenized deposit position";
        symbol = _symbol;
        underlying = _underlying;
        minDepositTime = 0;
        maxTotalSupplyInUsd = type(uint256).max;
        isActive = true;
        decimals = _decimals;
        collateralizationRatio = _collateralizationRatio;
    }

    function approve(address spender, uint256 _amount) external override returns (bool) {
        _approve(_msgSender(), spender, _amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        _approve(_msgSender(), spender, allowance[_msgSender()][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 currentAllowance = allowance[_msgSender()][spender];
        require(currentAllowance >= subtractedValue, "decreased-allowance-below-zero");
        unchecked {
            _approve(_msgSender(), spender, currentAllowance - subtractedValue);
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

        uint256 _senderBalance = balanceOf[_sender];
        require(_senderBalance >= _amount, "transfer-amount-exceeds-balance");
        unchecked {
            balanceOf[_sender] = _senderBalance - _amount;
        }
        balanceOf[_recipient] += _amount;

        emit Transfer(_sender, _recipient, _amount);

        _addToDepositTokensOfRecipientIfNeeded(_recipient, balanceOf[_recipient] - _amount);
        _removeFromDepositTokensOfSenderIfNeeded(_sender, balanceOf[_sender]);
    }

    function _mint(address _account, uint256 _amount)
        private
        onlyIfDepositTokenIsActive
        updateRewardsBeforeMintOrBurn(_account)
    {
        require(_account != address(0), "mint-to-the-zero-address");

        uint256 _newTotalSupplyInUsd = controller.masterOracle().convertToUsd(this, totalSupply + _amount);
        require(_newTotalSupplyInUsd <= maxTotalSupplyInUsd, "surpass-max-total-supply");
        lastDepositOf[_account] = block.timestamp;

        totalSupply += _amount;
        balanceOf[_account] += _amount;
        emit Transfer(address(0), _account, _amount);

        _addToDepositTokensOfRecipientIfNeeded(_account, balanceOf[_account] - _amount);
    }

    function _burn(address _account, uint256 _amount) private updateRewardsBeforeMintOrBurn(_account) {
        require(_account != address(0), "burn-from-the-zero-address");

        uint256 _accountBalance = balanceOf[_account];
        require(_accountBalance >= _amount, "burn-amount-exceeds-balance");
        unchecked {
            balanceOf[_account] = _accountBalance - _amount;
        }
        totalSupply -= _amount;

        emit Transfer(_account, address(0), _amount);

        _removeFromDepositTokensOfSenderIfNeeded(_account, balanceOf[_account]);
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
            controller.addToDepositTokensOfAccount(_recipient);
        }
    }

    function _removeFromDepositTokensOfSenderIfNeeded(address _sender, uint256 _senderBalanceAfter) private {
        if (_senderBalanceAfter == 0) {
            controller.removeFromDepositTokensOfAccount(_sender);
        }
    }

    /**
     * @notice Deposit colleteral and mint vsCollateral-Deposit (tokenized deposit position)
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

        address _sender = _msgSender();
        ITreasury _treasury = controller.treasury();

        uint256 _balanceBefore = underlying.balanceOf(address(_treasury));

        underlying.safeTransferFrom(_sender, address(_treasury), _amount);

        _amount = underlying.balanceOf(address(_treasury)) - _balanceBefore;

        uint256 _depositFee = controller.depositFee();
        uint256 _amountToDeposit = _amount;
        uint256 _feeAmount;
        if (_depositFee > 0) {
            _feeAmount = _amount.wadMul(_depositFee);
            _mint(address(_treasury), _feeAmount);
            _amountToDeposit -= _feeAmount;
        }

        _mint(_onBehalfOf, _amountToDeposit);

        emit CollateralDeposited(_sender, _onBehalfOf, _amount, _feeAmount);
    }

    /**
     * @notice Burn vsCollateral-Deposit and withdraw collateral
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

        address _account = _msgSender();

        require(_amount <= unlockedBalanceOf(_account), "amount-gt-unlocked");

        ITreasury _treasury = controller.treasury();

        uint256 _withdrawFee = controller.withdrawFee();
        uint256 _amountToWithdraw = _amount;
        uint256 _feeAmount;
        if (_withdrawFee > 0) {
            _feeAmount = _amount.wadMul(_withdrawFee);
            _transfer(_account, address(_treasury), _feeAmount);
            _amountToWithdraw -= _feeAmount;
        }

        _burnForWithdraw(_account, _amountToWithdraw);
        _treasury.pull(underlying, _to, _amountToWithdraw);

        emit CollateralWithdrawn(_account, _to, _amount, _feeAmount);
    }

    /**
     * @notice Mint deposit token when an account deposits collateral
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) external override onlyController {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn deposit token as part of withdraw process
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function _burnForWithdraw(address _from, uint256 _amount)
        private
        onlyIfNotLocked(_from, _amount)
        onlyIfMinDepositTimePassed(_from)
    {
        _burn(_from, _amount);
    }

    /**
     * @notice Burn deposit tokens
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) external override onlyController {
        _burn(_from, _amount);
    }

    /**
     * @notice Transfer tokens if checks pass
     * @param _sender The account to transfer from
     * @param _recipient The account to transfer to
     * @param _amount The amount to transfer
     */
    function _transferWithChecks(
        address _sender,
        address _recipient,
        uint256 _amount
    ) private onlyIfNotLocked(_sender, _amount) onlyIfMinDepositTimePassed(_sender) {
        _transfer(_sender, _recipient, _amount);
    }

    function transfer(address _to, uint256 _amount) external override returns (bool) {
        _transferWithChecks(_msgSender(), _to, _amount);
        return true;
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) external override nonReentrant returns (bool) {
        _transferWithChecks(_sender, _recipient, _amount);

        uint256 currentAllowance = allowance[_sender][_msgSender()];
        require(currentAllowance >= _amount, "amount-exceeds-allowance");
        unchecked {
            _approve(_sender, _msgSender(), currentAllowance - _amount);
        }

        return true;
    }

    /**
     * @notice Get the unlocked balance (i.e. transfarable, withdrawable)
     * @param _account The account to check
     * @return _unlockedBalance The amount that user can transfer or withdraw
     */
    function unlockedBalanceOf(address _account) public view override returns (uint256 _unlockedBalance) {
        (, , , , uint256 _issuableInUsd) = controller.debtPositionOf(_account);

        if (_issuableInUsd > 0) {
            uint256 _unlockedInUsd = _issuableInUsd.wadDiv(collateralizationRatio);
            _unlockedBalance = Math.min(
                balanceOf[_account],
                controller.masterOracle().convertFromUsd(this, _unlockedInUsd)
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
    ) external override onlyController {
        _transfer(_from, _to, _amount);
    }

    /**
     * @notice Update collateralization ratio
     * @param _newCollateralizationRatio The new CR value
     */
    function updateCollateralizationRatio(uint128 _newCollateralizationRatio) external override onlyGovernor {
        require(_newCollateralizationRatio <= 1e18, "collaterization-ratio-gt-100%");
        uint256 _currentCollateralizationRatio = collateralizationRatio;
        require(_newCollateralizationRatio != _currentCollateralizationRatio, "new-same-as-current");
        emit CollateralizationRatioUpdated(_currentCollateralizationRatio, _newCollateralizationRatio);
        collateralizationRatio = _newCollateralizationRatio;
    }

    /**
     * @notice Update minimum deposit time
     */
    function updateMinDepositTime(uint256 _newMinDepositTime) public onlyGovernor {
        uint256 _currentMinDepositTime = minDepositTime;
        require(_newMinDepositTime != _currentMinDepositTime, "new-same-as-current");
        emit MinDepositTimeUpdated(_currentMinDepositTime, _newMinDepositTime);
        minDepositTime = _newMinDepositTime;
    }

    /**
     * @notice Update max total supply
     * @param _newMaxTotalSupplyInUsd The new max total supply
     */
    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupplyInUsd) public override onlyGovernor {
        uint256 _currentMaxTotalSupplyInUsd = maxTotalSupplyInUsd;
        require(_newMaxTotalSupplyInUsd != _currentMaxTotalSupplyInUsd, "new-same-as-current");
        emit MaxTotalSupplyUpdated(_currentMaxTotalSupplyInUsd, _newMaxTotalSupplyInUsd);
        maxTotalSupplyInUsd = _newMaxTotalSupplyInUsd;
    }

    /**
     * @notice Enable/Disable the Deposit Token
     */
    function toggleIsActive() public override onlyGovernor {
        bool _isActive = isActive;
        emit DepositTokenActiveUpdated(_isActive, !_isActive);
        isActive = !_isActive;
    }
}
