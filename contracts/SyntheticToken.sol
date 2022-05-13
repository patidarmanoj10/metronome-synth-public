// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Manageable.sol";
import "./lib/WadRayMath.sol";
import "./storage/SyntheticTokenStorage.sol";

/**
 * @title Synthetic Token contract
 */
contract SyntheticToken is ReentrancyGuard, Manageable, SyntheticTokenStorageV1 {
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @notice Emitted when synthetic token is issued
    event SyntheticTokenIssued(address indexed account, address indexed to, uint256 amount, uint256 fee);

    /// @notice Emitted when synthetic's debt is repaid
    event DebtRepaid(address indexed payer, address indexed account, uint256 amount, uint256 fee);

    /**
     * @dev Throws if synthetic token doesn't exist
     */
    modifier onlyIfSyntheticTokenExists() {
        require(controller.isSyntheticTokenExists(this), "synthetic-inexistent");
        _;
    }

    /**
     * @dev Throws if synthetic token isn't enabled
     */
    modifier onlyIfSyntheticTokenIsActive() {
        require(isActive, "synthetic-inactive");
        _;
    }

    function initialize(
        string calldata _name,
        string calldata _symbol,
        uint8 _decimals,
        IController _controller,
        IDebtToken _debtToken,
        uint256 _interestRate,
        uint256 _maxTotalSupplyInUsd
    ) public initializer {
        require(address(_debtToken) != address(0), "debt-token-is-null");
        require(address(_controller) != address(0), "controller-address-is-zero");

        __Manageable_init();

        controller = _controller;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        debtToken = _debtToken;
        isActive = true;
        interestRate = _interestRate;
        maxTotalSupplyInUsd = _maxTotalSupplyInUsd;
    }

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupply, uint256 newMaxTotalSupply);

    /// @notice Emitted when active flag is updated
    event SyntheticTokenActiveUpdated(bool oldActive, bool newActive);

    /// @notice Emitted when interest rate is updated
    event InterestRateUpdated(uint256 oldInterestRate, uint256 newInterestRate);

    function interestRatePerSecond() external view virtual override returns (uint256) {
        return interestRate / SECONDS_PER_YEAR;
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = allowance[sender][_msgSender()];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "amount-exceeds-allowance");
            unchecked {
                _approve(sender, _msgSender(), currentAllowance - amount);
            }
        }

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
        address sender,
        address recipient,
        uint256 amount
    ) private {
        require(sender != address(0), "transfer-from-the-zero-address");
        require(recipient != address(0), "transfer-to-the-zero-address");

        uint256 senderBalance = balanceOf[sender];
        require(senderBalance >= amount, "transfer-amount-exceeds-balance");
        unchecked {
            balanceOf[sender] = senderBalance - amount;
        }
        balanceOf[recipient] += amount;

        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) private onlyIfSyntheticTokenIsActive {
        require(account != address(0), "mint-to-the-zero-address");
        uint256 _newTotalSupplyInUsd = controller.masterOracle().quoteTokenToUsd(this, totalSupply + amount);
        require(_newTotalSupplyInUsd <= maxTotalSupplyInUsd, "surpass-max-total-supply");

        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) private {
        require(account != address(0), "burn-from-the-zero-address");

        uint256 accountBalance = balanceOf[account];
        require(accountBalance >= amount, "burn-amount-exceeds-balance");
        unchecked {
            balanceOf[account] = accountBalance - amount;
        }
        totalSupply -= amount;

        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) private {
        require(owner != address(0), "approve-from-the-zero-address");
        require(spender != address(0), "approve-to-the-zero-address");

        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
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

        address _account = _msgSender();

        accrueInterest();

        (, , , , uint256 _issuableInUsd) = controller.debtPositionOf(_account);

        IMasterOracle _masterOracle = controller.masterOracle();

        require(_amount <= _masterOracle.quoteUsdToToken(this, _issuableInUsd), "not-enough-collateral");

        uint256 _debtFloorInUsd = controller.debtFloorInUsd();

        if (_debtFloorInUsd > 0) {
            require(
                _masterOracle.quoteTokenToUsd(this, debtToken.balanceOf(_account) + _amount) >= _debtFloorInUsd,
                "debt-lt-floor"
            );
        }

        uint256 _issueFee = controller.issueFee();
        uint256 _amountToIssue = _amount;
        uint256 _feeAmount;
        if (_issueFee > 0) {
            _feeAmount = _amount.wadMul(_issueFee);
            _mint(address(controller.treasury()), _feeAmount);
            _amountToIssue -= _feeAmount;
        }

        _mint(_to, _amountToIssue);
        debtToken.mint(_account, _amount);

        emit SyntheticTokenIssued(_account, _to, _amount, _feeAmount);
    }

    /**
     * @notice Send synthetic token to decrease debt
     * @dev The msg.sender is the payer and the account beneficed
     * @param _onBehalfOf The account that will have debt decreased
     * @param _amount The amount of synthetic token to burn (should consider the repay fee)
     */
    function repay(address _onBehalfOf, uint256 _amount) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");

        accrueInterest();

        address _payer = _msgSender();

        uint256 _repayFee = controller.repayFee();
        uint256 _amountToRepay = _amount;
        uint256 _feeAmount;
        if (_repayFee > 0) {
            _amountToRepay = _amount.wadDiv(1e18 + _repayFee);
            _feeAmount = _amount - _amountToRepay;
            _transfer(_payer, address(controller.treasury()), _feeAmount);
        }

        uint256 _debtFloorInUsd = controller.debtFloorInUsd();

        if (_debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = controller.masterOracle().quoteTokenToUsd(
                this,
                debtToken.balanceOf(_onBehalfOf) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= _debtFloorInUsd, "debt-lt-floor");
        }

        _burn(_payer, _amountToRepay);
        debtToken.burn(_onBehalfOf, _amountToRepay);

        emit DebtRepaid(_payer, _onBehalfOf, _amount, _feeAmount);
    }

    /**
     * @notice Mint synthetic token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) external override onlyController {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn synthetic token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) external override onlyController {
        _burn(_from, _amount);
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
     * @notice Enable/Disable the Synthetic Token
     */
    function toggleIsActive() external override onlyGovernor {
        bool _isActive = isActive;
        emit SyntheticTokenActiveUpdated(_isActive, !_isActive);
        isActive = !_isActive;
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
     * @notice Accrue interest
     */
    function accrueInterest() public {
        uint256 _interestAmountAccrued = debtToken.accrueInterest();

        if (_interestAmountAccrued > 0) {
            // Note: We can save some gas by incrementing only and mint all accrued amount later
            _mint(address(controller.treasury()), _interestAmountAccrued);
        }
    }
}
