// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/@layerzerolabs/solidity-examples/token/oft/composable/ComposableOFTCore.sol";
import "./dependencies/stargate-protocol/interfaces/IStargateReceiver.sol";
import "./dependencies/stargate-protocol/interfaces/IStargateRouter.sol";
import "./interfaces/external/ISwapper.sol";
import "./interfaces/ISyntheticToken.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IProxyOFT.sol";
import "./lib/WadRayMath.sol";

error SenderIsNotTheOwner();
error NotAvailableOnThisChain();
error InvalidFromAddress();
error InvalidMsgSender();
error InvalidSourceChain();

// TODO: Add all missing comments
// TODO: Create all missing update function
// TODO: Make it upgradable
// TODO: Having the same implementation for all chains or have `Layer1ProxyOFT` and `Layer2ProxyOFT` implementations?
// TODO: Cover revert scenarios
contract ProxyOFT is IProxyOFT, IStargateReceiver, ComposableOFTCore {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint256 public constant MAX_BPS = 100_00;

    // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
    uint16 public constant LZ_ADAPTER_PARAMS_VERSION = 2;

    // See more: https://stargateprotocol.gitbook.io/stargate/developers/function-types
    uint8 internal constant SG_TYPE_SWAP_REMOTE = 1;

    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;

    uint16 public immutable LZ_THIS_CHAIN_ID;

    ISyntheticToken internal immutable syntheticToken;

    uint256 public stargateSlippage = 10; // 0.1%

    ISwapper public swapper;

    uint64 public swapTxGasLimit = 500_000;

    IStargateRouter public stargateRouter;

    uint64 public callbackTxGasLimit = 750_000;

    // token => chainId => poolId
    mapping(address => mapping(uint16 => uint256)) public poolIdOf;

    // tokenHere => chainId => tokenThere
    mapping(address => mapping(uint16 => address)) public counterTokenOf;

    // Note: Stores other chains' ProxyOFT contracts
    mapping(uint16 => address) public proxyOftOf;

    constructor(
        address _lzEndpoint,
        ISyntheticToken syntheticToken_,
        uint16 lzChainId_
    ) ComposableOFTCore(_lzEndpoint) {
        syntheticToken = syntheticToken_;

        LZ_THIS_CHAIN_ID = lzChainId_;
    }

    function circulatingSupply() public view virtual override returns (uint) {
        return syntheticToken.totalSupply();
    }

    function token() public view virtual override returns (address) {
        return address(syntheticToken);
    }

    function _debitFrom(
        address from_,
        uint16 /*dstChainId_*/,
        bytes memory /*toAddress_*/,
        uint _amount
    ) internal virtual override returns (uint256 _sent) {
        if (from_ != _msgSender()) revert SenderIsNotTheOwner();
        syntheticToken.burn(from_, _amount);
        return _amount;
    }

    function _creditTo(
        uint16 /*srcChainId_*/,
        address toAddress_,
        uint _amount
    ) internal virtual override returns (uint256 _received) {
        syntheticToken.mint(toAddress_, _amount);
        return _amount;
    }

    /*//////////////////////////////////////////////////////////////
                              LAYER 2 OFT
    //////////////////////////////////////////////////////////////*/

    function quoteSwapAndCallbackNativeFee(
        address l2Pool_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) public view override returns (uint256 _nativeFee) {
        if (block.chainid == 1) revert NotAvailableOnThisChain();

        address _mainnetOFT = proxyOftOf[LZ_MAINNET_CHAIN_ID];
        uint64 _callbackTxGasLimit = callbackTxGasLimit;
        bytes memory _payload;
        bytes memory _adapterParams;
        {
            _payload = abi.encode(
                l2Pool_,
                bytes32(type(uint256).max), // The leverageKey. Using most expensive scenario
                counterTokenOf[tokenIn_][LZ_MAINNET_CHAIN_ID],
                counterTokenOf[tokenOut_][LZ_MAINNET_CHAIN_ID],
                amountOutMin_
            );

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(swapTxGasLimit + _callbackTxGasLimit),
                callbackTxNativeFee_,
                _mainnetOFT
            );
        }

        (uint256 _swapTxNativeFee, ) = this.estimateSendAndCallFee({
            _dstChainId: LZ_MAINNET_CHAIN_ID,
            _toAddress: abi.encodePacked(_mainnetOFT),
            _amount: amountIn_,
            _payload: _payload,
            // Note: `_dstGasForCall` is the extra gas for the further call triggered from the destination
            _dstGasForCall: _callbackTxGasLimit,
            _useZro: false,
            _adapterParams: _adapterParams
        });

        return _swapTxNativeFee;
    }

    function swapAndCallback(
        uint256 layer2LeverageId_,
        address payable refundAddress_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) public payable override {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (!syntheticToken.poolRegistry().isPoolRegistered(msg.sender)) revert InvalidMsgSender();

        address payable _refundAddress = refundAddress_;
        address _mainnetOFT = proxyOftOf[LZ_MAINNET_CHAIN_ID];
        uint64 _callbackTxGasLimit = callbackTxGasLimit;
        bytes memory _payload;
        bytes memory _adapterParams;
        {
            // Note: `amountIn` isn't needed here because it's part of the message
            _payload = abi.encode(
                msg.sender,
                layer2LeverageId_,
                counterTokenOf[tokenIn_][LZ_MAINNET_CHAIN_ID],
                counterTokenOf[tokenOut_][LZ_MAINNET_CHAIN_ID],
                amountOutMin_
            );

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(swapTxGasLimit + _callbackTxGasLimit),
                callbackTxNativeFee_,
                _mainnetOFT
            );
        }

        this.sendAndCall{value: msg.value}({
            _from: address(this),
            _dstChainId: LZ_MAINNET_CHAIN_ID,
            _toAddress: abi.encodePacked(_mainnetOFT),
            _amount: amountIn_,
            _payload: _payload,
            // Note: `_dstGasForCall` is the extra gas for the further call triggered from the destination
            _dstGasForCall: _callbackTxGasLimit,
            _refundAddress: _refundAddress,
            _zroPaymentAddress: address(0),
            _adapterParams: _adapterParams
        });
    }

    function sgReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint256 /*nonce_*/,
        address token_,
        uint256 amountLD_,
        bytes memory payload_
    ) external {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (abi.decode(srcAddress_, (address)) != proxyOftOf[srcChainId_]) revert InvalidFromAddress();
        if (srcChainId_ != LZ_MAINNET_CHAIN_ID) revert InvalidSourceChain();
        if (msg.sender != address(stargateRouter)) revert InvalidMsgSender();

        (address _poolAddress, uint256 _layer2LeverageId) = abi.decode(payload_, (address, uint256));

        IERC20(token_).safeApprove(_poolAddress, 0);
        IERC20(token_).safeApprove(_poolAddress, amountLD_);
        IPool(_poolAddress).layer2LeverageCallback(_layer2LeverageId, amountLD_);
    }

    /*//////////////////////////////////////////////////////////////
                              MAINNET OFT
    //////////////////////////////////////////////////////////////*/

    function quoteCallbackTxNativeFee(
        address l2Pool_,
        uint16 dstChainId_
    ) public view returns (uint256 _callbackTxNativeFee) {
        if (block.chainid != 1) revert NotAvailableOnThisChain();

        (_callbackTxNativeFee, ) = stargateRouter.quoteLayerZeroFee({
            _dstChainId: dstChainId_,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: abi.encodePacked(proxyOftOf[dstChainId_]),
            _transferAndCallPayload: abi.encodePacked(
                l2Pool_,
                bytes32(type(uint256).max) // The leverageKey. Using most expensive scenario
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: callbackTxGasLimit,
                dstNativeAmount: 0,
                dstNativeAddr: "0x"
            })
        });
    }

    function onOFTReceived(
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint64 /*nonce_*/,
        bytes calldata from_,
        uint amount_,
        bytes calldata payload_
    ) external override {
        if (block.chainid != 1) revert NotAvailableOnThisChain();
        if (srcChainId_ == LZ_MAINNET_CHAIN_ID) revert NotAvailableOnThisChain();
        if (abi.decode(srcAddress_, (address)) != from_.toAddress(0)) revert InvalidFromAddress();
        if (from_.toAddress(0) != proxyOftOf[srcChainId_]) revert InvalidFromAddress();
        if (msg.sender != address(this)) revert InvalidMsgSender();

        // 1. Swap synthetic token from L2 for collateral
        address _pool;
        bytes32 _key;
        address _collateral;
        uint256 _collateralAmount;
        {
            address _syntheticToken;
            uint256 _amountOutMin;
            (_pool, _key, _syntheticToken, _collateral, _amountOutMin) = abi.decode(
                payload_,
                (address, bytes32, address, address, uint256)
            );

            ISwapper _swapper = swapper;
            IERC20(_syntheticToken).safeApprove(address(_swapper), 0);
            IERC20(_syntheticToken).safeApprove(address(_swapper), amount_);
            _collateralAmount = _swapper.swapExactInput({
                tokenIn_: _syntheticToken,
                tokenOut_: _collateral,
                amountIn_: amount_,
                amountOutMin_: _amountOutMin,
                receiver_: address(this)
            });
        }

        // 2. Transfer collateral to L2 using Stargate
        uint16 _dstChainId = srcChainId_;
        // Note: `amountOut` isn't needed here because it's part of the message
        bytes memory _payload = abi.encode(_pool, _key);
        IStargateRouter _stargateRouter = stargateRouter;
        IERC20(_collateral).safeApprove(address(_stargateRouter), 0);
        IERC20(_collateral).safeApprove(address(_stargateRouter), _collateralAmount);
        _stargateRouter.swap{value: quoteCallbackTxNativeFee(_pool, _dstChainId)}({
            _dstChainId: _dstChainId,
            _srcPoolId: poolIdOf[_collateral][LZ_MAINNET_CHAIN_ID],
            _dstPoolId: poolIdOf[counterTokenOf[_collateral][_dstChainId]][_dstChainId],
            // Note: We can do a further swap (i.e. routerETH.swapETH) to refund the end user directly
            _refundAddress: payable(address(this)),
            _amountLD: _collateralAmount,
            _minAmountLD: _collateralAmount.wadMul(MAX_BPS - stargateSlippage),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: callbackTxGasLimit,
                dstNativeAmount: 0,
                dstNativeAddr: "0x"
            }),
            _to: abi.encodePacked(proxyOftOf[_dstChainId]),
            _payload: _payload
        });
    }

    receive() external payable {}

    // TODO:
    // - only owner/governor
    // - emit event
    function updateStargateRouter(IStargateRouter stargateRouter_) public {
        stargateRouter = stargateRouter_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    // - comment
    //      Use LZ ids (https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids)
    function updateProxyOftOf(uint16 chainId_, address proxyOft_) public {
        proxyOftOf[chainId_] = proxyOft_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    function updateSwapper(ISwapper swapper_) public {
        swapper = swapper_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    // - comment
    //      Use LZ ids (https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids)
    function updateCounterTokenOf(address tokenHere_, uint16 chainId_, address tokenThere_) public {
        counterTokenOf[tokenHere_][chainId_] = tokenThere_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    // - comment
    //      Use LZ ids (https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids)
    function updatePoolIdOf(address token_, uint16 chainId, uint256 poolId_) public {
        poolIdOf[token_][chainId] = poolId_;
    }
}
