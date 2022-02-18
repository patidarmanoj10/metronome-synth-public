// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./access/Manageable.sol";
import "./storage/SyntheticTokenStorage.sol";

/**
 * @title Synthetic Token contract
 */
contract SyntheticToken is Manageable, SyntheticTokenStorageV1 {
    string public constant VERSION = "1.0.0";

    uint256 public constant BLOCKS_PER_YEAR = 2102400;

    function initialize(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        IController _controller,
        IDebtToken _debtToken,
        uint256 _interestRate
    ) public initializer {
        require(address(_debtToken) != address(0), "debt-token-is-null");
        require(_decimals == _debtToken.decimals(), "debt-decimals-is-not-the-same");
        require(address(_controller) != address(0), "controller-address-is-zero");

        __Manageable_init();

        controller = _controller;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        debtToken = _debtToken;
        maxTotalSupplyInUsd = type(uint256).max;
        isActive = true;
        interestRate = _interestRate;
    }

    /// @notice Emitted when max total supply is updated
    event MaxTotalSupplyUpdated(uint256 oldMaxTotalSupply, uint256 newMaxTotalSupply);

    /// @notice Emitted when active flag is updated
    event SyntheticTokenActiveUpdated(bool oldActive, bool newActive);

    /// @notice Emitted when interest rate is updated
    event InterestRateUpdated(uint256 oldInterestRate, uint256 newInterestRate);

    function interestRatePerBlock() public view virtual override returns (uint256) {
        return interestRate / BLOCKS_PER_YEAR;
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = allowance[sender][_msgSender()];
        require(currentAllowance >= amount, "amount-exceeds-allowance");
        unchecked {
            _approve(sender, _msgSender(), currentAllowance - amount);
        }

        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, allowance[_msgSender()][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
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
    ) internal virtual {
        require(sender != address(0), "transfer-from-the-zero-address");
        require(recipient != address(0), "transfer-to-the-zero-address");

        _beforeTokenTransfer(sender, recipient, amount);

        uint256 senderBalance = balanceOf[sender];
        require(senderBalance >= amount, "transfer-amount-exceeds-balance");
        unchecked {
            balanceOf[sender] = senderBalance - amount;
        }
        balanceOf[recipient] += amount;

        emit Transfer(sender, recipient, amount);

        _afterTokenTransfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "mint-to-the-zero-address");

        _beforeTokenTransfer(address(0), account, amount);

        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);

        _afterTokenTransfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "burn-from-the-zero-address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountBalance = balanceOf[account];
        require(accountBalance >= amount, "burn-amount-exceeds-balance");
        unchecked {
            balanceOf[account] = accountBalance - amount;
        }
        totalSupply -= amount;

        emit Transfer(account, address(0), amount);

        _afterTokenTransfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "approve-from-the-zero-address");
        require(spender != address(0), "approve-to-the-zero-address");

        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount // solhint-disable-next-line no-empty-blocks
    ) internal virtual {}

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount // solhint-disable-next-line no-empty-blocks
    ) internal virtual {}

    /**
     * @notice Mint synthetic token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyController {
        require(isActive, "synthetic-is-inactive");
        uint256 _newTotalSupplyInUsd = controller.oracle().convertToUsd(IERC20(address(this)), totalSupply + _amount);
        require(_newTotalSupplyInUsd <= maxTotalSupplyInUsd, "surpass-max-total-supply");
        _mint(_to, _amount);
    }

    /**
     * @notice Burn synthetic token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyController {
        _burn(_from, _amount);
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
    ) public override onlyController {
        _transfer(_from, _to, _amount);
    }

    /**
     * @notice Update max total supply (in USD)
     * @param _newMaxTotalSupplyInUsd The new max total supply (in USD)
     */
    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupplyInUsd) public override onlyGovernor {
        emit MaxTotalSupplyUpdated(maxTotalSupplyInUsd, _newMaxTotalSupplyInUsd);
        maxTotalSupplyInUsd = _newMaxTotalSupplyInUsd;
    }

    /**
     * @notice Enable/Disable the Synthetic Token
     */
    function toggleIsActive() public override onlyGovernor {
        emit SyntheticTokenActiveUpdated(isActive, !isActive);
        isActive = !isActive;
    }

    /**
     * @notice Update interest rate (APR)
     */
    function updateInterestRate(uint256 _newInterestRate) public override onlyGovernor {
        accrueInterest();
        emit InterestRateUpdated(interestRate, _newInterestRate);
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
