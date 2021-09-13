// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICollateral is IERC20 {
    function underlyingAsset() external view returns (address);

    function mint(address _to, uint256 _amount) external;

    function burn(address _to, uint256 _amount) external;
}
