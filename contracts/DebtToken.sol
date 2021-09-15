// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IDebtToken.sol";

/**
 * @title Non-transferable token that represents users' debts
 */
contract DebtToken is ERC20, Ownable, IDebtToken {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

    /**
     * @notice Mint debt token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn debt token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyOwner {
        _burn(_from, _amount);
    }

    /**
     * @notice Use _beforeTokenTransfer hook to disable transfers
     * @dev Minting and burning should keep enabled
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 /*amount*/
    ) internal pure override {
        require(from == address(0) || to == address(0), "non-transferable-token");
    }
}
