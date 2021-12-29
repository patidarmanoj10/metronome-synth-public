// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IVSynth.sol";

interface IWETHGateway {
    function depositETH(IVSynth _vSynth) external payable;

    function withdrawETH(IVSynth _vSynth, uint256 _amount) external;
}
