// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/@layerzerolabs/solidity-examples/token/oft/composable/ComposableOFTCore.sol";
import "./dependencies/stargate-protocol/interfaces/IStargateReceiver.sol";
import "./interfaces/external/ISwapper.sol";
import "./interfaces/external/IStargateFactory.sol";
import "./interfaces/external/IStargatePool.sol";
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
// TODO: Should slippage (on retry) increases only? This question is valid for Pool retry functions too
// TODO: Should slippage (on retry) have timeout as DEX has?  This question is valid for Pool retry functions too
contract ProxyOFT is IProxyOFT, IStargateReceiver, ComposableOFTCore {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint256 public constant MAX_BPS = 100_00;

    // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
    uint16 public constant LZ_ADAPTER_PARAMS_VERSION = 2;

    // See more: https://stargateprotocol.gitbook.io/stargate/developers/function-types
    uint8 internal constant SG_TYPE_SWAP_REMOTE = 1;

    // TODO: Create setter for this
    uint16 public constant LZ_MAINNET_CHAIN_ID = 101;

    // TODO: Create setter for this
    uint16 public immutable LZ_THIS_CHAIN_ID;

    ISyntheticToken internal immutable syntheticToken;

    uint256 public stargateSlippage = 10; // 0.1%

    ISwapper public swapper;

    uint64 public leverageSwapTxGasLimit = 500_000;

    uint64 public flashRepaySwapTxGasLimit = 500_000;

    IStargateRouter public stargateRouter;

    uint64 public leverageCallbackTxGasLimit = 750_000;

    uint64 public flashRepayCallbackTxGasLimit = 750_000;

    // token => chainId => poolId
    mapping(address => uint256) public poolIdOf;

    mapping(uint256 => uint256) swapAmountOutMin;

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

    function onOFTReceived(
        uint16 srcChainId_,
        bytes calldata /*srcAddress_*/,
        uint64 /*nonce_*/,
        bytes calldata from_,
        uint amount_,
        bytes calldata payload_
    ) external override {
        if (block.chainid == 1) {
            swapSynthAndTriggerCallback(srcChainId_, from_, amount_, payload_);
        } else {
            executeFlashRepayCallback(srcChainId_, from_, amount_, payload_);
        }
    }

    function sgReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint256 /*nonce_*/,
        address token_,
        uint256 amountLD_,
        bytes memory payload_
    ) external override {
        if (block.chainid != 1) {
            executeLeverageCallback(srcChainId_, srcAddress_, token_, amountLD_, payload_);
        } else {
            swapUnderlyingAndTriggerCallback(srcChainId_, srcAddress_, token_, amountLD_, payload_);
        }
    }

    /*//////////////////////////////////////////////////////////////
                              LAYER 2 OFT
    //////////////////////////////////////////////////////////////*/

    function quoteFlashRepaySwapNativeFee(
        address l2Pool_,
        address /*tokenIn_*/, // TODO: Keep it here?
        uint256 /*amountIn_*/, // TODO: Keep it here?
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external view returns (uint256 _nativeFee) {
        if (block.chainid == 1) revert NotAvailableOnThisChain();

        bytes memory _mainnetOFT = abi.encodePacked(_getProxyOftOf(LZ_MAINNET_CHAIN_ID));

        (_nativeFee, ) = stargateRouter.quoteLayerZeroFee({
            _dstChainId: LZ_MAINNET_CHAIN_ID,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: _mainnetOFT,
            _transferAndCallPayload: abi.encodePacked(
                l2Pool_,
                bytes32(type(uint256).max), // requestId
                address(type(uint160).max), // account
                amountOutMin_
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: flashRepaySwapTxGasLimit + flashRepayCallbackTxGasLimit,
                dstNativeAmount: callbackTxNativeFee_,
                dstNativeAddr: _mainnetOFT
            })
        });
    }

    function quoteLeverageSwapNativeFee(
        address l2Pool_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) public view override returns (uint256 _nativeFee) {
        if (block.chainid == 1) revert NotAvailableOnThisChain();

        address _mainnetOFT = _getProxyOftOf(LZ_MAINNET_CHAIN_ID);
        uint64 _callbackTxGasLimit = leverageCallbackTxGasLimit;
        bytes memory _payload;
        bytes memory _adapterParams;
        {
            _payload = abi.encode(
                l2Pool_,
                bytes32(type(uint256).max), // requestId
                poolIdOf[tokenOut_],
                address(type(uint160).max), // account
                amountOutMin_
            );

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(leverageSwapTxGasLimit + _callbackTxGasLimit),
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

    function triggerFlashRepaySwap(
        uint256 requestId_,
        address payable account_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external payable override {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (!syntheticToken.poolRegistry().isPoolRegistered(msg.sender)) revert InvalidMsgSender();

        bytes memory _payload;
        bytes memory _mainnetOFT;
        {
            // Note: `amountIn` isn't needed here because it's part of the message
            _payload = abi.encode(msg.sender, requestId_, account_, amountOutMin_);
            _mainnetOFT = abi.encodePacked(_getProxyOftOf(LZ_MAINNET_CHAIN_ID));
        }

        IStargateRouter _stargateRouter = stargateRouter;
        IERC20(tokenIn_).safeApprove(address(_stargateRouter), 0);
        IERC20(tokenIn_).safeApprove(address(_stargateRouter), amountIn_);
        _stargateRouter.swap{value: msg.value}({
            _dstChainId: LZ_MAINNET_CHAIN_ID,
            _srcPoolId: poolIdOf[tokenIn_],
            _dstPoolId: poolIdOf[tokenIn_],
            _refundAddress: account_,
            _amountLD: amountIn_,
            _minAmountLD: (amountIn_ * (MAX_BPS - stargateSlippage)) / MAX_BPS,
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: flashRepaySwapTxGasLimit + flashRepayCallbackTxGasLimit,
                dstNativeAmount: callbackTxNativeFee_,
                dstNativeAddr: _mainnetOFT
            }),
            _to: _mainnetOFT,
            _payload: _payload
        });
    }

    function triggerLeverageSwap(
        uint256 requestId_,
        address payable account_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        uint256 callbackTxNativeFee_
    ) external payable override {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (!syntheticToken.poolRegistry().isPoolRegistered(msg.sender)) revert InvalidMsgSender();

        address payable _refundAddress = account_; // Stack too deep

        address _mainnetOFT = _getProxyOftOf(LZ_MAINNET_CHAIN_ID);
        uint64 _leverageCallbackTxGasLimit = leverageCallbackTxGasLimit;
        bytes memory _payload;
        bytes memory _adapterParams;
        {
            // Note: `amountIn` isn't needed here because it's part of the message
            _payload = abi.encode(msg.sender, requestId_, poolIdOf[tokenOut_], account_, amountOutMin_);

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(leverageSwapTxGasLimit + _leverageCallbackTxGasLimit),
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
            _dstGasForCall: _leverageCallbackTxGasLimit,
            _refundAddress: _refundAddress,
            _zroPaymentAddress: address(0),
            _adapterParams: _adapterParams
        });
    }

    function executeFlashRepayCallback(
        uint16 srcChainId_,
        bytes memory from_,
        uint256 amountLD_,
        bytes memory payload_
    ) private {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (from_.toAddress(0) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
        if (srcChainId_ != LZ_MAINNET_CHAIN_ID) revert InvalidSourceChain();

        (address _poolAddress, uint256 _layer2FlashRepayId) = abi.decode(payload_, (address, uint256));

        IERC20 _syntheticToken = syntheticToken;

        _syntheticToken.safeApprove(_poolAddress, 0);
        _syntheticToken.safeApprove(_poolAddress, amountLD_);
        IPool(_poolAddress).layer2FlashRepayCallback(_layer2FlashRepayId, amountLD_);
    }

    function executeLeverageCallback(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        address token_,
        uint256 amountLD_,
        bytes memory payload_
    ) private {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (abi.decode(srcAddress_, (address)) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
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

    function quoteLeverageCallbackNativeFee(
        address l2Pool_,
        uint16 dstChainId_
    ) public view returns (uint256 _callbackTxNativeFee) {
        if (block.chainid != 1) revert NotAvailableOnThisChain();

        (_callbackTxNativeFee, ) = stargateRouter.quoteLayerZeroFee({
            _dstChainId: dstChainId_,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: abi.encodePacked(_getProxyOftOf(dstChainId_)),
            _transferAndCallPayload: abi.encodePacked(
                l2Pool_,
                bytes32(type(uint256).max) // requestId
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: leverageCallbackTxGasLimit,
                dstNativeAmount: 0,
                dstNativeAddr: "0x"
            })
        });
    }

    function quoteFlashRepayCallbackNativeFee(
        address l2Pool_,
        uint16 dstChainId_
    ) public view returns (uint256 _callbackTxNativeFee) {
        if (block.chainid != 1) revert NotAvailableOnThisChain();

        (_callbackTxNativeFee, ) = this.estimateSendAndCallFee({
            _dstChainId: dstChainId_,
            _toAddress: abi.encodePacked(_getProxyOftOf(dstChainId_)),
            _amount: type(uint256).max, // TODO: Review
            _payload: abi.encode(
                l2Pool_,
                bytes32(type(uint256).max) // requestId
            ),
            // Note: `_dstGasForCall` is the extra gas for the further call triggered from the destination
            _dstGasForCall: flashRepayCallbackTxGasLimit,
            _useZro: false,
            _adapterParams: abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(flashRepayCallbackTxGasLimit),
                uint256(0),
                address(0)
            )
        });
    }

    function swapSynthAndTriggerCallback(
        uint16 srcChainId_,
        bytes calldata from_,
        uint amount_,
        bytes calldata payload_
    ) private {
        if (block.chainid != 1) revert NotAvailableOnThisChain();
        if (srcChainId_ == LZ_MAINNET_CHAIN_ID) revert NotAvailableOnThisChain();
        if (from_.toAddress(0) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
        if (msg.sender != address(this)) revert InvalidMsgSender();

        IStargateRouter _stargateRouter = stargateRouter;

        // 1. Swap synthetic token from L2 for underlying
        address _pool;
        uint256 _requestId;
        address _underlying;
        uint256 _amountOut;
        {
            address _account;
            uint256 _amountOutMin;
            uint256 _underlyingPoolId;
            (_pool, _requestId, _underlyingPoolId, _account, _amountOutMin) = abi.decode(
                payload_,
                (address, uint256, uint256, address, uint256)
            );

            _underlying = IStargatePool(IStargateFactory(_stargateRouter.factory()).getPool(_underlyingPoolId)).token();

            _amountOut = _swap({
                requestId_: _requestId,
                swapper_: swapper,
                tokenIn_: address(syntheticToken),
                tokenOut_: _underlying,
                amountIn_: amount_,
                amountOutMin_: _amountOutMin
            });
        }

        // 2. Transfer underlying to L2 using Stargate
        uint16 _dstChainId = srcChainId_;
        uint256 _poolId = poolIdOf[_underlying];
        // Note: `amountOut` isn't needed here because it's part of the message
        bytes memory _payload = abi.encode(_pool, _requestId); // Stack too deep
        IERC20(_underlying).safeApprove(address(_stargateRouter), 0);
        IERC20(_underlying).safeApprove(address(_stargateRouter), _amountOut);
        _stargateRouter.swap{value: quoteLeverageCallbackNativeFee(_pool, _dstChainId)}({
            _dstChainId: _dstChainId,
            _srcPoolId: _poolId,
            _dstPoolId: _poolId,
            // Note: We can do a further swap (i.e. routerETH.swapETH) to refund the end user directly
            _refundAddress: payable(address(this)),
            _amountLD: _amountOut,
            _minAmountLD: (_amountOut * (MAX_BPS - stargateSlippage)) / MAX_BPS,
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: leverageCallbackTxGasLimit,
                dstNativeAmount: 0,
                dstNativeAddr: "0x"
            }),
            _to: abi.encodePacked(_getProxyOftOf(_dstChainId)),
            _payload: _payload
        });
    }

    function swapUnderlyingAndTriggerCallback(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        address _underlying,
        uint amount_,
        bytes memory payload_
    ) private {
        if (block.chainid != 1) revert NotAvailableOnThisChain();
        if (srcChainId_ == LZ_MAINNET_CHAIN_ID) revert NotAvailableOnThisChain();
        if (abi.decode(srcAddress_, (address)) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();

        // 1. Swap underlying from L2 for synthetic token
        address _pool;
        uint256 _requestId;
        uint256 _amountOut;
        {
            address _account;
            uint256 _amountOutMin;

            (_pool, _requestId, _account, _amountOutMin) = abi.decode(payload_, (address, uint256, address, uint256));

            _amountOut = _swap({
                requestId_: _requestId,
                swapper_: swapper,
                tokenIn_: _underlying,
                tokenOut_: address(syntheticToken),
                amountIn_: amount_,
                amountOutMin_: _amountOutMin
            });
        }

        // 2. Transfer synthetic token to L2 using LayerZero
        uint16 _dstChainId = srcChainId_;

        this.sendAndCall{value: quoteFlashRepayCallbackNativeFee(_pool, _dstChainId)}({
            _from: address(this),
            _dstChainId: _dstChainId,
            _toAddress: abi.encodePacked(_getProxyOftOf(_dstChainId)),
            _amount: _amountOut,
            // Note: `amountOut` isn't needed here because it's part of the message
            _payload: abi.encode(_pool, _requestId),
            // Note: `_dstGasForCall` is the extra gas for the further call triggered from the destination
            _dstGasForCall: flashRepayCallbackTxGasLimit,
            // Note: We can do a further swap (i.e. routerETH.swapETH) to refund the end user directly
            _refundAddress: payable(address(this)),
            _zroPaymentAddress: address(0),
            _adapterParams: abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(flashRepayCallbackTxGasLimit),
                uint256(0),
                address(0)
            )
        });
    }

    function _swap(
        uint256 requestId_,
        ISwapper swapper_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_
    ) private returns (uint256 _amountOut) {
        // 1. Use updated slippage if exist
        uint256 _storedAmountOutMin = swapAmountOutMin[requestId_];

        if (_storedAmountOutMin > 0) {
            amountOutMin_ = _storedAmountOutMin;
        }

        // 2. Perform swap
        IERC20(tokenIn_).safeApprove(address(swapper_), 0);
        IERC20(tokenIn_).safeApprove(address(swapper_), amountIn_);
        _amountOut = swapper_.swapExactInput({
            tokenIn_: tokenIn_,
            tokenOut_: tokenOut_,
            amountIn_: amountIn_,
            amountOutMin_: amountOutMin_,
            receiver_: address(this)
        });

        // 3. Clear stored slippage if swap succeeds
        _storedAmountOutMin = 0;
    }

    // TODO: Comment
    // TODO: We may change OFT implementation to make it store message params same as SG `cachedSwapLookup` mapping does
    function retrySwapSynthAndTriggerCallback(
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint64 nonce_,
        uint amount_,
        bytes calldata payload_,
        uint256 newAmountOutMin_
    ) public {
        (, uint256 _requestId, , address _account, ) = abi.decode(
            payload_,
            (address, uint256, address, address, uint256)
        );
        if (msg.sender != _account) revert InvalidMsgSender();

        swapAmountOutMin[_requestId] = newAmountOutMin_;

        // Note: `retryOFTReceived` has checks to ensure that the args are consistent
        bytes memory _from = abi.encodePacked(_getProxyOftOf(srcChainId_));
        address _to = address(this);
        this.retryOFTReceived(srcChainId_, srcAddress_, nonce_, _from, _to, amount_, payload_);
    }

    // TODO: Comment
    function retrySwapUnderlyingAndTriggerCallback(
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint256 nonce_,
        uint256 newAmountOutMin_
    ) public {
        IStargateRouter _stargateRouter = stargateRouter;

        (, , , bytes memory _payload) = _stargateRouter.cachedSwapLookup(srcChainId_, srcAddress_, nonce_);
        (, uint256 _requestId, address _account, ) = abi.decode(_payload, (address, uint256, address, uint256));

        if (msg.sender != _account) revert InvalidMsgSender();

        swapAmountOutMin[_requestId] = newAmountOutMin_;

        _stargateRouter.clearCachedSwap(srcChainId_, srcAddress_, nonce_);
    }

    receive() external payable {}

    // TODO:
    // - only owner/governor
    // - emit event
    function updateStargateRouter(IStargateRouter stargateRouter_) public {
        stargateRouter = stargateRouter_;
    }

    function _getProxyOftOf(uint16 chainId_) private view returns (address _proxyOft) {
        return trustedRemoteLookup[chainId_].toAddress(0);
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
    //      Use LZ ids (https://stargateprotocol.gitbook.io/stargate/developers/pool-ids)
    function updatePoolIdOf(address token_, uint256 poolId_) public {
        poolIdOf[token_] = poolId_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    function updateStargateSlippage(uint256 stargateSlippage_) external {
        stargateSlippage = stargateSlippage_;
    }
}
