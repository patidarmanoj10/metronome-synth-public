// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";

interface IDepositToken is IERC20Metadata {
    function underlying() external view returns (IERC20);

    function collateralizationRatio() external view returns (uint256);

    function unlockedBalanceOf(address _account) external view returns (uint256);

    function lockedBalanceOf(address _account) external view returns (uint256);

    function minDepositTime() external view returns (uint256);

    function lastDepositOf(address _account) external view returns (uint256);

    function deposit(uint256 _amount, address _onBehalfOf) external;

    function withdraw(uint256 _amount, address _to) external;

    function mint(address _to, uint256 _amount) external;

    function burn(address _from, uint256 _amount) external;

    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external;

    function updateCollateralizationRatio(uint128 _newCollateralizationRatio) external;

    function isActive() external view returns (bool);

    function toggleIsActive() external;

    function maxTotalSupplyInUsd() external view returns (uint256);

    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupplyInUsd) external;
}
