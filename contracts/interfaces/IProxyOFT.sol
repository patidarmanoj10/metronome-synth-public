// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/@layerzerolabs/solidity-examples/token/oft/composable/IOFTReceiver.sol";
import "../dependencies/@layerzerolabs/solidity-examples/token/oft/composable/IComposableOFTCore.sol";
import "../dependencies/stargate-protocol/interfaces/IStargateRouter.sol";

interface IProxyOFT is IComposableOFTCore, IOFTReceiver {
    function stargateRouter() external view returns (IStargateRouter);
}
