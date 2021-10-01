// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/ERC20.sol";
import "./access/Manageable.sol";
import "./interface/IDepositToken.sol";
import "./interface/IMBox.sol";

/**
 * @title Represents the users' deposits
 * @dev For now, we only support MET as collateral
 */
contract DepositToken is ERC20, Manageable, IDepositToken {
    /**
     * @notice Deposit underlying asset (i.e. MET)
     */
    address public override underlying;

    /**
     * @notice The min amount of time that an account should wait after depoist MET before be able to withdraw
     * TODO: Set default value from `initialize` function
     */
    uint256 public minDepositTime;

    /**
     * @notice Stores de timestamp of last deposit event of each account. It's used combined with `minDepositTime`.
     */
    mapping(address => uint256) public lastDepositOf;

    /// @notice Emitted when minimum deposit time is updated
    event MinDepositTimeUpdated(uint256 oldMinDepositTime, uint256 newMinDepositTime);

    constructor(address _underlying) ERC20("Tokenized deposit position", "mBOX-MET") {
        underlying = _underlying;
    }

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

    function transfer(address _to, uint256 _amount) public override(ERC20, IERC20) returns (bool) {
        return _transferWithChecks(_msgSender(), _to, _amount);
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override(ERC20, IERC20) returns (bool) {
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
