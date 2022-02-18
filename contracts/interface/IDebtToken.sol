// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "./ISyntheticToken.sol";

interface IDebtToken is IERC20, IERC20Metadata {
    function syntheticToken() external view returns (ISyntheticToken);

    function accrueInterest() external returns (uint256 _interestAmountAccrued);

    function mint(address _to, uint256 _amount) external;

    function burn(address _from, uint256 _amount) external;
}
