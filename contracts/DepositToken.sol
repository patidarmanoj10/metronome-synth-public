// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./access/Manageable.sol";
import "./interface/IDepositToken.sol";
import "./interface/IMBox.sol";

contract DepositTokenStorageV1 {
    mapping(address => uint256) internal _balances;

    mapping(address => mapping(address => uint256)) internal _allowances;

    uint256 internal _totalSupply;

    string internal _name;
    string internal _symbol;

    address internal _underlying; // Deposit underlying asset (i.e. MET)

    /**
     * @notice The min amount of time that an account should wait after depoist MET before be able to withdraw
     * TODO: Set default value from `initialize` function
     */
    uint256 public minDepositTime;

    /**
     * @notice Stores de timestamp of last deposit event of each account. It's used combined with `minDepositTime`.
     */
    mapping(address => uint256) public lastDepositOf;
}

/**
 * @title Represents the users' deposits
 * @dev For now, we only support MET as collateral
 */

contract DepositToken is IDepositToken, Manageable, DepositTokenStorageV1 {
    string public constant VERSION = "1.0.0";

    /// @notice Emitted when minimum deposit time is updated
    event MinDepositTimeUpdated(uint256 oldMinDepositTime, uint256 newMinDepositTime);

    /**
     * @dev Throws if minimum deposit time haven't passed
     */
    modifier onlyIfMinDepositTimePassed(address _account, uint256 _amount) {
        require(block.timestamp >= lastDepositOf[_account] + minDepositTime, "min-deposit-time-have-not-passed");
        _;
    }

    /**
     * @notice Requires that amount is lower than the account's unlocked balance
     */
    modifier onlyIfNotLocked(address _account, uint256 _amount) {
        (, , , , , uint256 _unlockedDeposit, ) = mBox.debtPositionOf(_account);
        require(_unlockedDeposit >= _amount, "not-enough-free-balance");
        _;
    }

    function initialize(address underlying_, IMBox _mBox) public initializer {
        require(underlying_ != address(0), "underlying-is-null");

        __Manageable_init(_mBox);

        _name = "Tokenized deposit position";
        _symbol = "mBOX-MET";
        _underlying = underlying_;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function underlying() public view virtual override returns (address) {
        return _underlying;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        uint256 currentAllowance = _allowances[_msgSender()][spender];
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

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "transfer-amount-exceeds-balance");
        unchecked {
            _balances[sender] = senderBalance - amount;
        }
        _balances[recipient] += amount;

        emit Transfer(sender, recipient, amount);

        _afterTokenTransfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "mint-to-the-zero-address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);

        _afterTokenTransfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "burn-from-the-zero-address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "burn-amount-exceeds-balance");
        unchecked {
            _balances[account] = accountBalance - amount;
        }
        _totalSupply -= amount;

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

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}

    /**
     * @notice Mint deposit token when an account deposits MET
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyMBox {
        _mint(_to, _amount);
        lastDepositOf[_to] = block.timestamp;
    }

    /**
     * @notice Burn deposit token as fee charging
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burnAsFee(address _from, uint256 _amount) public override onlyMBox onlyIfNotLocked(_from, _amount) {
        _burn(_from, _amount);
    }

    /**
     * @notice Burn deposit token as part of withdraw process
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burnForWithdraw(address _from, uint256 _amount)
        public
        override
        onlyMBox
        onlyIfNotLocked(_from, _amount)
        onlyIfMinDepositTimePassed(_from, _amount)
    {
        _burn(_from, _amount);
    }

    /**
     * @notice Burn deposit tokens
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyMBox {
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
    ) private onlyIfNotLocked(_sender, _amount) onlyIfMinDepositTimePassed(_sender, _amount) returns (bool) {
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function transfer(address _to, uint256 _amount) public override returns (bool) {
        return _transferWithChecks(_msgSender(), _to, _amount);
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override returns (bool) {
        return _transferWithChecks(_sender, _recipient, _amount);
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
    ) public override onlyMBox {
        _transfer(_from, _to, _amount);
    }

    /**
     * @notice Set minimum deposit time
     */
    function setMinDepositTime(uint256 _newMinDepositTime) public onlyGovernor {
        require(_newMinDepositTime != minDepositTime, "new-value-is-same-as-current");
        emit MinDepositTimeUpdated(minDepositTime, _newMinDepositTime);
        minDepositTime = _newMinDepositTime;
    }
}
