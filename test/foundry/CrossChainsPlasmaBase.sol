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

contract CrossChainsPlasmaBase_Test is Test {
    using stdStorage for StdStorage;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint16 public constant LZ_BASE_CHAIN_ID = 184;
    uint16 public constant LZ_PLASMA_CHAIN_ID = 383;

    uint256 baseFork;
    uint256 plasmaFork;

    address msUSD_base = 0x526728DBc96689597F85ae4cd716d4f7fCcBAE9d;
    address msUSD_plasma = 0x29AD7fE4516909b9e498B5a65339e54791293234;
    ProxyOFT msUSD_proxyOFT_base = ProxyOFT(0x2AF13BF84F8B452cB86839330F514Cc5c2899217);
    ProxyOFT msUSD_proxyOFT_plasma = ProxyOFT(0xCBfa3f8a32ab63E461B6BBFda881ef01EB4eF75D);
    ILayerZeroEndpointExtended lzEndpoint_base = ILayerZeroEndpointExtended(0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7);
    ILayerZeroEndpointExtended lzEndpoint_plasma =
        ILayerZeroEndpointExtended(0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7);
    PoolRegistry poolRegistry_base = PoolRegistry(payable(0x4372A2b9304296c06197a823f25Cf03119d2Fd82));

    address governor_base = 0xE01Df4ac1E1e57266900E62C37F12C986495A618;
    address alice = makeAddr("alice");

    uint16 constant LZ_ADAPTER_PARAMS_VERSION = 1;
    uint16 constant PT_SEND = 0;
    uint256 constant SIMPLE_TRANSFER_GAS = 200_000;

    function setUp() public virtual {
        baseFork = vm.createSelectFork(vm.envString("BASE_NODE_URL"));
        vm.rollFork(baseFork, 44435200);

        plasmaFork = vm.createSelectFork(vm.envString("PLASMA_NODE_URL"));
        vm.rollFork(plasmaFork, 1974630);

        vm.selectFork(baseFork);

        vm.startPrank(governor_base);
        msUSD_proxyOFT_base.setTrustedRemote(
            LZ_PLASMA_CHAIN_ID,
            abi.encodePacked(address(msUSD_proxyOFT_plasma), address(msUSD_proxyOFT_base))
        );
        msUSD_proxyOFT_base.setUseCustomAdapterParams(true);
        msUSD_proxyOFT_base.setMinDstGas(LZ_PLASMA_CHAIN_ID, msUSD_proxyOFT_base.PT_SEND(), 200_000);

        // poolRegistry_base.toggleDestinationChainIsActive(LZ_PLASMA_CHAIN_ID);

        vm.stopPrank();
    }

    function test_sendFromBaseToPlasma() public {
        vm.selectFork(baseFork);
        uint256 amount = 1e18;
        uint16 dstChainId = LZ_PLASMA_CHAIN_ID;

        // deal alice
        deal(msUSD_base, alice, amount);
        uint256 fee = msUSD_proxyOFT_base.estimateSendFee(dstChainId, alice, amount);
        deal(alice, fee);

        //
        // when
        //
        vm.startPrank(alice);
        msUSD_proxyOFT_base.sendFrom{value: fee}(alice, dstChainId, alice, amount);
        vm.stopPrank();

        address lzAppFrom = address(msUSD_proxyOFT_base);
        address lzAppTo = address(msUSD_proxyOFT_plasma);

        bytes memory toAddress = abi.encodePacked(alice);

        vm.selectFork(plasmaFork);

        vm.startPrank(lzEndpoint_plasma.defaultReceiveLibraryAddress());
        lzEndpoint_plasma.receivePayload({
            _srcChainId: LZ_BASE_CHAIN_ID,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: lzEndpoint_plasma.getInboundNonce(LZ_BASE_CHAIN_ID, abi.encode(lzAppFrom)) + 1,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });
        assertEq(IERC20(msUSD_plasma).balanceOf(alice), amount);
    }

    function test_sendFromPlasmaToBase() public {
        vm.selectFork(plasmaFork);
        uint256 amount = 1e18;
        uint16 dstChainId = LZ_BASE_CHAIN_ID;

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
        address lzAppTo = address(msUSD_proxyOFT_base);

        bytes memory toAddress = abi.encodePacked(alice);

        vm.selectFork(baseFork);

        vm.startPrank(lzEndpoint_base.defaultReceiveLibraryAddress());
        lzEndpoint_base.receivePayload({
            _srcChainId: LZ_PLASMA_CHAIN_ID,
            _srcAddress: abi.encodePacked(lzAppFrom, lzAppTo),
            _dstAddress: lzAppTo,
            _nonce: 222, //lzEndpoint_base.getInboundNonce(LZ_PLASMA_CHAIN_ID, abi.encode(lzAppFrom)) + 2,
            _gasLimit: SIMPLE_TRANSFER_GAS,
            _payload: abi.encode(PT_SEND, toAddress, amount)
        });

        assertEq(IERC20(msUSD_base).balanceOf(alice), amount);
    }
}
