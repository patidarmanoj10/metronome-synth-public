// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDepositToken is IERC20 {
    function underlying() external view returns (address);

    function mint(address _to, uint256 _amount) external;

    function burnUnlocked(address _to, uint256 _amount) external;

    function burn(address _from, uint256 _amount) external;

    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external;
}
