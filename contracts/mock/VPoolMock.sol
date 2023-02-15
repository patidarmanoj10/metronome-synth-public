// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/ERC20.sol";
import "../interfaces/external/IVPool.sol";

contract VPoolMock is IVPool, ERC20 {
    address public token;

    constructor(string memory name_, string memory symbol_, address token_) ERC20(name_, symbol_) {
        token = token_;
    }

    function deposit(uint256 amount_) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount_);
        _mint(msg.sender, amount_ * (10 ** (decimals() - IERC20Metadata(token).decimals())));
    }

    function withdraw(uint256 shares_) external {
        _burn(msg.sender, shares_);
        IERC20(token).transfer(msg.sender, shares_ / (10 ** (decimals() - IERC20Metadata(token).decimals())));
    }

    function mint(address to_, uint256 amount_) external {
        _mint(to_, amount_);
    }
}
