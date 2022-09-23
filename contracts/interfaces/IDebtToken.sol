// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "./ISyntheticToken.sol";

interface IDebtToken is IERC20Metadata {
    function isActive() external view returns (bool);

    function syntheticToken() external view returns (ISyntheticToken);

    function accrueInterest() external;

    function debtIndex() external returns (uint256 _debtIndex);

    function burn(address _from, uint256 _amount) external;

    function issue(uint256 _amount, address _to) external;

    function repay(address _onBehalfOf, uint256 _amount) external;

    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupply) external;

    function updateInterestRate(uint256 _newInterestRate) external;

    function maxTotalSupplyInUsd() external view returns (uint256);

    function interestRate() external view returns (uint256);

    function interestRatePerSecond() external view returns (uint256);

    function toggleIsActive() external;
}
