// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICollateral is IERC20 {
    function lockedBalanceOf(address _account) external view returns (uint256 _freeBalance);

    function mint(address _to, uint256 _amount) external;

    function burn(address _to, uint256 _amount) external;

    function lock(address _account, uint256 _amount) external;

    function unlock(address _account, uint256 _amount) external;

    function freeBalanceOf(address _account) external view returns (uint256 _freeBalance);
}
