// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";

/**
 * @notice Reward Distributor interface
 */
interface IRewardsDistributor {
    function rewardToken() external view returns (IERC20);

    function tokenSpeeds(IERC20 _token) external view returns (uint256);

    function tokensAccruedOf(address _account) external view returns (uint256);

    function updateBeforeMintOrBurn(IERC20 _token, address _account) external;

    function updateBeforeTransfer(
        IERC20 _token,
        address _from,
        address _to
    ) external;

    function claimRewards(address _account) external;

    function claimRewards(address _account, IERC20[] memory _tokens) external;

    function claimRewards(address[] memory _accounts, IERC20[] memory _tokens) external;
}
