// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Context} from "../dependencies/openzeppelin/utils/Context.sol";
import {IOperator} from "../interfaces/IOperator.sol";
import {IPoolRegistry} from "../interfaces/IPoolRegistry.sol";

abstract contract SynthContext is Context {
    /// @notice Get pool registry contract
    function poolRegistry() public view virtual returns (IPoolRegistry);

    /// @inheritdoc Context
    function _msgSender() internal view virtual override returns (address) {
        IPoolRegistry _poolRegistry = poolRegistry();
        if (address(_poolRegistry) != address(0)) {
            IOperator _operator = _poolRegistry.operator();
            if (msg.sender == address(_operator)) {
                return _operator.getActualMsgSender();
            }
        }

        return msg.sender;
    }
}
