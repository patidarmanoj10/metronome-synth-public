// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {IMasterOracle} from "./external/IMasterOracle.sol";
import {IPauseable} from "./IPauseable.sol";
import {IGovernable} from "./IGovernable.sol";
import {ISyntheticToken} from "./ISyntheticToken.sol";
import {ISwapper} from "./external/ISwapper.sol";
import {IOperator} from "./IOperator.sol";

interface IPoolRegistry is IPauseable, IGovernable {
    function feeCollector() external view returns (address);

    function isPoolRegistered(address pool_) external view returns (bool);

    function nativeTokenGateway() external view returns (address);

    function getPools() external view returns (address[] memory);

    function registerPool(address pool_) external;

    function unregisterPool(address pool_) external;

    function masterOracle() external view returns (IMasterOracle);

    function updateFeeCollector(address newFeeCollector_) external;

    function idOfPool(address pool_) external view returns (uint256);

    function nextPoolId() external view returns (uint256);

    function swapper() external view returns (ISwapper);

    function doesSyntheticTokenExist(ISyntheticToken syntheticToken_) external view returns (bool _exists);

    function operator() external view returns (IOperator);

    function isGuardian(address) external view returns (bool);

    function isBridgingActive() external view returns (bool);

    function lzBaseGasLimit() external view returns (uint256);

    function isDestinationChainSupported(uint16 dstChainId_) external view returns (bool);
}
