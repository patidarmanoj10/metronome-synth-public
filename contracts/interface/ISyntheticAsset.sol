// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "./IDebtToken.sol";

interface ISyntheticAsset is IERC20, IERC20Metadata {
    function isActive() external view returns (bool);

    function maxTotalSupplyInUsd() external view returns (uint256);

    function interestRate() external view returns (uint256);

    function interestRatePerBlock() external view returns (uint256);

    function debtToken() external view returns (IDebtToken);

    function collateralizationRatio() external view returns (uint256);

    function mint(address _to, uint256 amount) external;

    function burn(address _from, uint256 amount) external;

    function updateCollateralizationRatio(uint128 _newCollateralizationRatio) external;

    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupply) external;

    function toggleIsActive() external;

    function updateInterestRate(uint256 _newInterestRate) external;

    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external;
}
