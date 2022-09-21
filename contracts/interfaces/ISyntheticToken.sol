// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import "./IDebtToken.sol";

interface ISyntheticToken is IERC20Metadata {
    function isActive() external view returns (bool);

    function mint(address _to, uint256 amount) external;

    function burn(address _from, uint256 amount) external;

    function toggleIsActive() external;

    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external;
}
