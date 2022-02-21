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

    function approve(address spender, uint256 _amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, _amount);
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
        uint256 _amount
    ) internal virtual nonReentrant {
        require(sender != address(0), "transfer-from-the-zero-address");
        require(recipient != address(0), "transfer-to-the-zero-address");

        _beforeTokenTransfer(sender, recipient, _amount);

        uint256 senderBalance = balanceOf[sender];
        require(senderBalance >= _amount, "transfer-amount-exceeds-balance");
        unchecked {
            balanceOf[sender] = senderBalance - _amount;
        }
        balanceOf[recipient] += _amount;

        emit Transfer(sender, recipient, _amount);

        _afterTokenTransfer(sender, recipient, _amount);
    }

    function _mint(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "mint-to-the-zero-address");

        _beforeTokenTransfer(address(0), _account, _amount);

        totalSupply += _amount;
        balanceOf[_account] += _amount;
        emit Transfer(address(0), _account, _amount);

        _afterTokenTransfer(address(0), _account, _amount);
    }

    function _burn(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "burn-from-the-zero-address");

        _beforeTokenTransfer(_account, address(0), _amount);

        uint256 accountBalance = balanceOf[_account];
        require(accountBalance >= _amount, "burn-amount-exceeds-balance");
        unchecked {
            balanceOf[_account] = accountBalance - _amount;
        }
        totalSupply -= _amount;

        emit Transfer(_account, address(0), _amount);

        _afterTokenTransfer(_account, address(0), _amount);
    }

    function _approve(
        address _owner,
        address _spender,
        uint256 _amount
    ) internal virtual {
        require(_owner != address(0), "approve-from-the-zero-address");
        require(_spender != address(0), "approve-to-the-zero-address");

        allowance[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function _beforeTokenTransfer(
        address, /*_from*/
        address _to,
        uint256 /*_amount*/
    ) internal virtual {
        if (balanceOf[_to] == 0) {
            controller.addToDepositTokensOfAccount(_to);
        }
    }

    function _afterTokenTransfer(
        address _from,
        address, /*_to*/
        uint256 /*_amount*/
    ) internal virtual {
        if (balanceOf[_from] == 0) {
            controller.removeFromDepositTokensOfAccount(_from);
        }
    }

    /**
     * @notice Mint deposit token when an account deposits collateral
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyController {
        require(isActive, "deposit-token-is-inactive");
        uint256 _newTotalSupplyInUsd = controller.masterOracle().convertToUsd(this, totalSupply + _amount);
        require(_newTotalSupplyInUsd <= maxTotalSupplyInUsd, "surpass-max-total-supply");
        _mint(_to, _amount);
        lastDepositOf[_to] = block.timestamp;
    }

    /**
     * @notice Burn deposit token as part of withdraw process
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burnForWithdraw(address _from, uint256 _amount)
        public
        override
        onlyController
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
    function burn(address _from, uint256 _amount) public override onlyController {
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

    function transfer(address _to, uint256 _amount) public override returns (bool) {
        _transferWithChecks(_msgSender(), _to, _amount);
        return true;
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override returns (bool) {
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
    function lockedBalanceOf(address _account) public view override returns (uint256 _lockedBalance) {
        return balanceOf[_account] - unlockedBalanceOf(_account);
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
     * @notice Update collateralization ratio
     * @param _newCollateralizationRatio The new CR value
     */
    function updateCollateralizationRatio(uint128 _newCollateralizationRatio) public override onlyGovernor {
        require(_newCollateralizationRatio <= 1e18, "collaterization-ratio-gt-100%");
        emit CollateralizationRatioUpdated(collateralizationRatio, _newCollateralizationRatio);
        collateralizationRatio = _newCollateralizationRatio;
    }

    /**
     * @notice Update minimum deposit time
     */
    function updateMinDepositTime(uint256 _newMinDepositTime) public onlyGovernor {
        require(_newMinDepositTime != minDepositTime, "new-value-is-same-as-current");
        emit MinDepositTimeUpdated(minDepositTime, _newMinDepositTime);
        minDepositTime = _newMinDepositTime;
    }

    /**
     * @notice Update max total supply
     * @param _newMaxTotalSupplyInUsd The new max total supply
     */
    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupplyInUsd) public override onlyGovernor {
        emit MaxTotalSupplyUpdated(maxTotalSupplyInUsd, _newMaxTotalSupplyInUsd);
        maxTotalSupplyInUsd = _newMaxTotalSupplyInUsd;
    }

    /**
     * @notice Enable/Disable the Deposit Token
     */
    function toggleIsActive() public override onlyGovernor {
        emit DepositTokenActiveUpdated(isActive, !isActive);
        isActive = !isActive;
    }
}
