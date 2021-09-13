// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/ICollateral.sol";

/// @title Represents the users' deposits for a given collateral
/// @dev For now, we support only MET as collateral
contract Collateral is ERC20, Ownable, ICollateral {
    /// @notice Returns the amount of tokens owned and locked by `account`.
    mapping(address => uint256) public override lockedBalanceOf;

    constructor() ERC20("Tokenized deposit position", "mBOX-MET") {}

    function mint(address _to, uint256 _amount) public override onlyOwner {
        // Note: The minting amount goes to free balance, so no further change is needed
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) public override onlyOwner {
        require(freeBalanceOf(_from) >= _amount, "amount-gt-free");
        _burn(_from, _amount);
    }

    function lock(address _account, uint256 _amount) public override onlyOwner {
        require(balanceOf(_account) >= _amount, "amount-gt-balance");
        lockedBalanceOf[_account] += _amount;
    }

    function unlock(address _account, uint256 _amount) public override onlyOwner {
        require(lockedBalanceOf[_account] >= _amount, "amount-gt-locked");
        lockedBalanceOf[_account] -= _amount;
    }

    function freeBalanceOf(address _account) public view override returns (uint256 _freeBalance) {
        _freeBalance = balanceOf(_account) - lockedBalanceOf[_account];
    }

    function _beforeTokenTransfer(
        address from,
        address, /*to*/
        uint256 amount
    ) internal view override {
        // allow minting
        if (from == address(0)) {
            return;
        }
        require(freeBalanceOf(from) >= amount, "not-enough-free-balance");
    }
}
