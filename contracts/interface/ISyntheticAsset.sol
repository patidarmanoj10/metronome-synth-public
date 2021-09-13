// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IDebt.sol";

interface ISyntheticAsset is IERC20 {
    function underlyingAsset() external view returns (address);

    function debtToken() external view returns (IDebt);

    function collateralizationRatio() external view returns (uint256);

    function mint(address _to, uint256 amount) external;

    function setCollateralizationRatio(uint256 _newCollateralizationRatio) external;
}
