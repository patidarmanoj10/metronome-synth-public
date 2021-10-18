// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "./IDebtToken.sol";

interface ISyntheticAsset is IERC20, IERC20Metadata {
    function maxTotalSupply() external view returns (uint256);

    function debtToken() external view returns (IDebtToken);

    function collateralizationRatio() external view returns (uint256);

    function mint(address _to, uint256 amount) external;

    function burn(address _from, uint256 amount) external;

    function updateCollateralizationRatio(uint256 _newCollateralizationRatio) external;

    function updateMaxTotalSupply(uint256 _newMaxTotalSupply) external;
}
