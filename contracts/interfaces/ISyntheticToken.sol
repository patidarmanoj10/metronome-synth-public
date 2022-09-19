// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "./IDebtToken.sol";

interface ISyntheticToken is IERC20Metadata {
    function isActive() external view returns (bool);

    function maxTotalSupplyInUsd() external view returns (uint256);

    function interestRate() external view returns (uint256);

    function interestRatePerSecond() external view returns (uint256);

    function mint(address _to, uint256 amount) external;

    function burn(address _from, uint256 amount) external;

    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupply) external;

    function toggleIsActive() external;

    function updateInterestRate(uint256 _newInterestRate) external;

    function issue(uint256 _amount, address _to) external;

    function repay(address _onBehalfOf, uint256 _amount) external;

    function accrueInterest() external;
}
