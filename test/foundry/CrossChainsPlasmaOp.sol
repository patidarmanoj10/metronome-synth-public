// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import {IERC20} from "contracts/dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {BytesLib} from "contracts/dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {ILayerZeroEndpoint} from "contracts/dependencies/@layerzerolabs/solidity-examples/interfaces/ILayerZeroEndpoint.sol";
import {Pool as StargatePool} from "contracts/dependencies/stargate-protocol/Pool.sol";
import {IStargateRouter} from "contracts/dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
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

contract CrossChainsPlasmaOp_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_OP_CHAIN_ID = 111;
    uint16 public constant LZ_PLASMA_CHAIN_ID = 383;

    uint256 opFork;
    uint256 plasmaFork;

    address msUSD_op = 0x9dAbAE7274D28A45F0B65Bf8ED201A5731492ca0;
    address msUSD_plasma = 0x29AD7fE4516909b9e498B5a65339e54791293234;
    ProxyOFT msUSD_proxyOFT_op = ProxyOFT(0xc2C433D36d7184192E442a243b351a9e3055FD5f);
    ProxyOFT msUSD_proxyOFT_plasma = ProxyOFT(0xCBfa3f8a32ab63E461B6BBFda881ef01EB4eF75D);
    ILayerZeroEndpointExtended lzEndpoint_op = ILayerZeroEndpointExtended(0x3c2269811836af69497E5F486A85D7316753cf62);
    ILayerZeroEndpointExtended lzEndpoint_plasma =
        ILayerZeroEndpointExtended(0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7);

    address governor_op = 0xE01Df4ac1E1e57266900E62C37F12C986495A618;
    address alice = makeAddr("alice");

    uint16 constant LZ_ADAPTER_PARAMS_VERSION = 1;
    uint16 constant PT_SEND = 0;
    uint256 constant SIMPLE_TRANSFER_GAS = 200_000;

    function setUp() public virtual {
        opFork = vm.createSelectFork(vm.envString("OPTIMISM_NODE_URL"));
        vm.rollFork(opFork, 141820800);

        plasmaFork = vm.createSelectFork(vm.envString("PLASMA_NODE_URL"));
        vm.rollFork(plasmaFork, 1974630);
    }

    function test_sendFromOptimismToPlasma() public {
        vm.selectFork(opFork);
        uint256 amount = 1e18;
        uint16 dstChainId = LZ_PLASMA_CHAIN_ID;

        // deal alice
        deal(msUSD_op, alice, amount);
        uint256 fee = msUSD_proxyOFT_op.estimateSendFee(dstChainId, alice, amount);
        deal(alice, fee);

        //
        // when
        //
        vm.startPrank(alice);
        msUSD_proxyOFT_op.sendFrom{value: fee}(alice, dstChainId, alice, amount);
        vm.stopPrank();

        address lzAppFrom = address(msUSD_proxyOFT_op);
        address lzAppTo = address(msUSD_proxyOFT_plasma);

        bytes memory toAddress = abi.encodePacked(alice);

        vm.selectFork(plasmaFork);

        vm.startPrank(lzEndpoint_plasma.defaultReceiveLibraryAddress());
        lzEndpoint_plasma.receivePayload({
            _srcChainId: LZ_OP_CHAIN_ID,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: lzEndpoint_plasma.getInboundNonce(LZ_OP_CHAIN_ID, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });
        assertEq(IERC20(msUSD_plasma).balanceOf(alice), amount);
    }

    function test_sendFromPlasmaToOptimism() public {
        vm.selectFork(plasmaFork);
        uint256 amount = 1e18;
        uint16 dstChainId = LZ_OP_CHAIN_ID;

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
        address lzAppTo = address(msUSD_proxyOFT_op);

        bytes memory toAddress = abi.encodePacked(alice);

        vm.selectFork(opFork);

        vm.startPrank(lzEndpoint_op.defaultReceiveLibraryAddress());
        lzEndpoint_op.receivePayload({
            _srcChainId: LZ_PLASMA_CHAIN_ID,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: lzEndpoint_op.getInboundNonce(LZ_PLASMA_CHAIN_ID, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });
        assertEq(IERC20(msUSD_op).balanceOf(alice), amount);
    }
}
