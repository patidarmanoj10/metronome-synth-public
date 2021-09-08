// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISyntheticAsset is IERC20 {
    function underlyingAsset() external returns (address);

    function collateralizationRatio() external returns (uint256);

    function mint(address _to, uint256 amount) external;

    function setCollateralizationRatio(uint256 _newCollateralizationRatio) external;
}
