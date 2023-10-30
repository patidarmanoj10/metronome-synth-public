// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";

contract PoolRewardsMock {
    address[] public rewardTokens;

    function updateReward(address) external {}

    function getRewardTokens() external view returns (address[] memory) {
        return rewardTokens;
    }

    function claimReward(address) external {
        for (uint256 i; i < rewardTokens.length; ++i) {
            uint256 _balance = IERC20(rewardTokens[i]).balanceOf(address(this));
            if (_balance > 0) {
                IERC20(rewardTokens[i]).transfer(msg.sender, _balance);
            }
        }
    }

    function setRewardTokens(address[] memory rewardTokens_) external {
        rewardTokens = rewardTokens_;
    }
}
