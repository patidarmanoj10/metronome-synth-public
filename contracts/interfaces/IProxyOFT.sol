// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/IOFTReceiverUpgradeable.sol";
import "../dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/IComposableOFTCoreUpgradeable.sol";
import "../dependencies/stargate-protocol/interfaces/IStargateRouter.sol";

interface IProxyOFT is IComposableOFTCoreUpgradeable, IOFTReceiverUpgradeable {
    function stargateRouter() external view returns (IStargateRouter);
}
