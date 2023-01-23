// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "../interfaces/external/ISwapper.sol";

contract SwapperMock is ISwapper {
    uint256 public rate = 1e18;

    function swapExactInput(
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        address _receiver
    ) external returns (uint256 _amountOut) {
        IERC20(tokenIn_).transferFrom(msg.sender, address(this), amountIn_);

        _amountOut = (amountIn_ * rate) / 1e18;
        require(_amountOut >= amountOutMin_, "swapper-mock-slippage");
        require(_amountOut > 100, "amount-out-zero");

        IERC20(tokenOut_).transfer(_receiver, _amountOut);
    }

    function updateRate(uint256 rate_) external {
        rate = rate_;
    }
}
