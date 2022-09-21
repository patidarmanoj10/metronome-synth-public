// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./external/IMasterOracle.sol";
import "./IGovernable.sol";
import "./ISyntheticToken.sol";

interface IPoolRegistry is IGovernable {
    function poolExists(address pool_) external view returns (bool);

    function feeCollector() external view returns (address);

    function getPools() external view returns (address[] memory);

    function registerPool(address pool_) external;

    function unregisterPool(address pool_) external;

    function isSyntheticTokenExists(ISyntheticToken _syntheticToken) external view returns (bool);

    function swap(
        ISyntheticToken _syntheticTokenIn,
        ISyntheticToken _syntheticTokenOut,
        uint256 _amountIn
    ) external returns (uint256 _amountOut);

    function updateSwapFee(uint256 _newSwapFee) external;

    function masterOracle() external view returns (IMasterOracle);

    function updateMasterOracle(IMasterOracle _newOracle) external;
}
