// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IDebt.sol";

/// @title Debt Token contract
contract Debt is ERC20, Ownable, IDebt {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) public override onlyOwner {
        _burn(_from, _amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 /*amount*/
    ) internal pure override {
        require(from == address(0) || to == address(0), "non-transferable-token");
    }
}
