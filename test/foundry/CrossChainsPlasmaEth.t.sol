// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {IERC20} from "contracts/dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {BytesLib} from "contracts/dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {ILayerZeroEndpoint} from "contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroEndpoint.sol";
import {Pool as StargatePool} from "contracts/dependencies/stargate-protocol/Pool.sol";
import {IStargateRouter} from "contracts/dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
import {PoolRegistry} from "contracts/PoolRegistry.sol";
import {Pool} from "contracts/Pool.sol";
import {ProxyOFT} from "contracts/ProxyOFT.sol";
import {WadRayMath} from "contracts/lib/WadRayMath.sol";

interface ILayerZeroEndpointExtended is ILayerZeroEndpoint {
    function defaultReceiveLibraryAddress() external view returns (address);
}

interface IStargateRouterExtended is IStargateRouter {
    function bridge() external view returns (address);

    function swapRemote(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint256 _nonce,
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        uint256 _dstGasForCall,
        address _to,
        StargatePool.SwapObj memory _s,
        bytes memory _payload
    ) external;

    function retryRevert(uint16 _srcChainId, bytes calldata _srcAddress, uint256 _nonce) external payable;
}

contract CrossChainsPlasmaEth_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_ETH_CHAIN_ID = 101;
    uint16 public constant LZ_PLASMA_CHAIN_ID = 383;

    uint256 ethFork;
    uint256 plasmaFork;

    address msUSD_eth = 0xab5eB14c09D416F0aC63661E57EDB7AEcDb9BEfA;
    address msUSD_plasma = 0x29AD7fE4516909b9e498B5a65339e54791293234;
    ProxyOFT msUSD_proxyOFT_eth = ProxyOFT(0xF37982E3F33ac007C690eD6266F3402d24aA27Ea);
    ProxyOFT msUSD_proxyOFT_plasma = ProxyOFT(0xCBfa3f8a32ab63E461B6BBFda881ef01EB4eF75D);
    ILayerZeroEndpointExtended lzEndpoint_eth = ILayerZeroEndpointExtended(0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675);
    ILayerZeroEndpointExtended lzEndpoint_plasma =
        ILayerZeroEndpointExtended(0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7);
    PoolRegistry poolRegistry_eth = PoolRegistry(payable(0x11eaD85C679eAF528c9C1FE094bF538Db880048A));

    address governor_eth = 0xd1DE3F9CD4AE2F23DA941a67cA4C739f8dD9Af33;
    address alice = makeAddr("alice");

    uint16 constant LZ_ADAPTER_PARAMS_VERSION = 1;
    uint16 constant PT_SEND = 0;
    uint256 constant SIMPLE_TRANSFER_GAS = 200_000;

    function setUp() public virtual {
        ethFork = vm.createSelectFork(vm.envString("MAINNET_NODE_URL"));
        vm.rollFork(ethFork, 24835650);

        plasmaFork = vm.createSelectFork(vm.envString("PLASMA_NODE_URL"));
        vm.rollFork(plasmaFork, 1909817);

        vm.selectFork(ethFork);

        vm.startPrank(governor_eth);
        msUSD_proxyOFT_eth.setTrustedRemote(
            LZ_PLASMA_CHAIN_ID,
            abi.encodePacked(address(msUSD_proxyOFT_plasma), address(msUSD_proxyOFT_eth))
        );
        msUSD_proxyOFT_eth.setUseCustomAdapterParams(true);
        msUSD_proxyOFT_eth.setMinDstGas(LZ_PLASMA_CHAIN_ID, msUSD_proxyOFT_eth.PT_SEND(), 200_000);

        // poolRegistry_eth.toggleDestinationChainIsActive(LZ_PLASMA_CHAIN_ID);

        vm.stopPrank();
    }

    function test_sendFromEthToPlasma() public {
        vm.selectFork(ethFork);
        uint256 amount = 1e18;
        uint16 dstChainId = LZ_PLASMA_CHAIN_ID;

        // deal alice
        deal(msUSD_eth, alice, amount);
        uint256 fee = msUSD_proxyOFT_eth.estimateSendFee(dstChainId, alice, amount);
        deal(alice, fee);

        //
        // when
        //
        vm.startPrank(alice);
        msUSD_proxyOFT_eth.sendFrom{value: fee}(alice, dstChainId, alice, amount);
        vm.stopPrank();

        address lzAppFrom = address(msUSD_proxyOFT_eth);
        address lzAppTo = address(msUSD_proxyOFT_plasma);

        bytes memory toAddress = abi.encodePacked(alice);

        vm.selectFork(plasmaFork);

        vm.startPrank(lzEndpoint_plasma.defaultReceiveLibraryAddress());
        lzEndpoint_plasma.receivePayload({
            _srcChainId: LZ_ETH_CHAIN_ID,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: lzEndpoint_plasma.getInboundNonce(LZ_ETH_CHAIN_ID, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });

        assertEq(IERC20(msUSD_plasma).balanceOf(alice), amount);
    }

    function test_sendFromPlasmaToEth() public {
        vm.selectFork(plasmaFork);
        uint256 amount = 1e18;
        uint16 dstChainId = LZ_ETH_CHAIN_ID;

        // deal alice
        deal(msUSD_plasma, alice, amount);
        uint256 fee = msUSD_proxyOFT_plasma.estimateSendFee(dstChainId, alice, amount);
        deal(alice, fee);

        //
        // when
        //
        vm.startPrank(alice);
        msUSD_proxyOFT_plasma.sendFrom{value: fee}(alice, dstChainId, alice, amount);
        vm.stopPrank();

        address lzAppFrom = address(msUSD_proxyOFT_plasma);
        address lzAppTo = address(msUSD_proxyOFT_eth);

        bytes memory toAddress = abi.encodePacked(alice);

        vm.selectFork(ethFork);

        vm.startPrank(lzEndpoint_eth.defaultReceiveLibraryAddress());
        lzEndpoint_eth.receivePayload({
            _srcChainId: LZ_PLASMA_CHAIN_ID,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: 101, // lzEndpoint_eth.getInboundNonce(LZ_PLASMA_CHAIN_ID, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });

        assertEq(IERC20(msUSD_eth).balanceOf(alice), amount);
    }
}
