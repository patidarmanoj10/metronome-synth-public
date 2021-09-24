// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IDepositToken.sol";
import "./interface/IMBox.sol";

/**
 * @title Represents the users' deposits
 * @dev For now, we only support MET as collateral
 */
contract DepositToken is ERC20, Ownable, IDepositToken {
    /**
     * @notice Deposit underlying asset (i.e. MET)
     */
    address public override underlying;

    /**
     * @notice mBox contract
     * @dev Used to check the amount of collateral locked
     */
    IMBox public mBox;

    constructor(address _underlying) ERC20("Tokenized deposit position", "mBOX-MET") {
        underlying = _underlying;
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
     * @notice Mint deposit token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn deposit token
     * @dev Can only burn unlocked funds
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burnUnlocked(address _from, uint256 _amount) public override onlyOwner onlyIfNotLocked(_from, _amount) {
        _burn(_from, _amount);
    }

    /**
     * @notice Burn deposit tokens as fee collect approach
     * @dev This function can burn locked funds
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyOwner {
        _burn(_from, _amount);
    }

    function transfer(address _to, uint256 _amount)
        public
        override(ERC20, IERC20)
        onlyIfNotLocked(_msgSender(), _amount)
        returns (bool)
    {
        return ERC20.transfer(_to, _amount);
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override(ERC20, IERC20) onlyIfNotLocked(_sender, _amount) returns (bool) {
        return ERC20.transferFrom(_sender, _recipient, _amount);
    }

    /**
     * @notice Seize deposit token
     * @dev Same as _transfer
     * @param _from The account to burn from
     * @param _to The acount to receive token
     * @param _amount The amount to burn
     */
    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) public override onlyOwner {
        _transfer(_from, _to, _amount);
    }

    /**
     * @notice Set mBox contract
     * @param _mBox The new mBox contract
     */
    function setMBox(IMBox _mBox) public onlyOwner {
        mBox = _mBox;
    }
}
