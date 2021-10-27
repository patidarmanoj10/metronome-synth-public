// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";

interface IDepositToken is IERC20, IERC20Metadata {
    function underlying() external view returns (IERC20);

    function minDepositTime() external view returns (uint256);

    function lastDepositOf(address _account) external view returns (uint256);

    function mint(address _to, uint256 _amount) external;

    function burnFromUnlocked(address _to, uint256 _amount) external;

    function burnForWithdraw(address _to, uint256 _amount) external;

    function burn(address _from, uint256 _amount) external;

    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external;
}
