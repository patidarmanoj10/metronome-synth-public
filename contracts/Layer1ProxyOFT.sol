// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./ProxyOFT.sol";
import "./storage/Layer1ProxyOFTStorage.sol";
import "./interfaces/external/IStargatePool.sol";
import "./interfaces/external/IStargateFactory.sol";

/**
 * @title Layer1ProxyOFT contract
 */
contract Layer1ProxyOFT is ProxyOFT, Layer1ProxyOFTStorage {
    using BytesLib for bytes;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) public initializer {
        __ProxyOFT_init(_lzEndpoint, syntheticToken_);
    }

    /**
     * @notice Called by the OFT contract when synthetic tokens are received from source chain.
     * @dev These tokens are swapped to other token and sent to source chain using Stargate
     * @param srcChainId_ The chain id of the source chain.
     * @param from_ The address of the account who calls the sendAndCall() on the source chain.
     * @param amount_ The amount of tokens to transfer.
     * @param payload_ Additional data with no specified format.
     */
    function onOFTReceived(
        uint16 srcChainId_,
        bytes calldata /*srcAddress_*/,
        uint64 /*nonce_*/,
        bytes calldata from_,
        uint amount_,
        bytes calldata payload_
    ) external override {
        if (from_.toAddress(0) != getProxyOFTOf(srcChainId_)) revert InvalidFromAddress();
        if (msg.sender != address(this)) revert InvalidMsgSender();

        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();

        // 1. Swap synthetic token from L2 for underlying
        address _smartFarmingManager;
        uint256 _requestId;
        address _underlying;
        address _account;
        {
            uint256 _amountOutMin;
            uint256 _underlyingPoolId;
            (_smartFarmingManager, _requestId, _underlyingPoolId, _account, _amountOutMin) = abi.decode(
                payload_,
                (address, uint256, uint256, address, uint256)
            );

            _underlying = IStargatePool(
                IStargateFactory(_poolRegistry.stargateRouter().factory()).getPool(_underlyingPoolId)
            ).token();

            amount_ = _swap({
                poolRegistry_: _poolRegistry,
                requestId_: _requestId,
                tokenIn_: address(syntheticToken),
                tokenOut_: _underlying,
                amountIn_: amount_,
                amountOutMin_: _amountOutMin
            });
        }

        // 2. Transfer underlying to L2 using Stargate
        uint16 _dstChainId = srcChainId_;

        sendUsingStargate(
            _poolRegistry,
            _underlying,
            LayerZeroParams({
                dstChainId: _dstChainId,
                amountIn: amount_,
                nativeFee: _poolRegistry.quoter().quoteLeverageCallbackNativeFee(_dstChainId),
                payload: abi.encode(_smartFarmingManager, _requestId),
                refundAddress: _account,
                dstGasForCall: _poolRegistry.leverageCallbackTxGasLimit(),
                dstNativeAmount: 0
            })
        );
    }

    /**
     * @notice Receive token & payload from Stargate.
     * @dev After swapped to Synthetic token , it trigger flashRepayCallback to source chain
     * @param srcChainId_ The chain id of the source chain.
     * @param srcAddress_ The remote Bridge address
     * @param token_ The token contract on the local chain
     * @param amount_ The qty of local _token contract tokens
     * @param payload_ The bytes containing the _tokenOut, _deadline, _amountOutMin, _toAddr
     */
    function sgReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint256 /*nonce_*/,
        address token_,
        uint256 amount_,
        bytes memory payload_
    ) external override {
        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();

        if (msg.sender != address(_poolRegistry.stargateRouter())) revert InvalidMsgSender();
        if (abi.decode(srcAddress_, (address)) != getProxyOFTOf(srcChainId_)) revert InvalidFromAddress();

        // 1. Swap underlying from L2 for synthetic token
        (address _smartFarmingManager, uint256 _requestId, address _account, uint256 _amountOutMin) = abi.decode(
            payload_,
            (address, uint256, address, uint256)
        );

        amount_ = _swap({
            poolRegistry_: _poolRegistry,
            requestId_: _requestId,
            tokenIn_: token_,
            tokenOut_: address(syntheticToken),
            amountIn_: amount_,
            amountOutMin_: _amountOutMin
        });

        // 2. Transfer synthetic token to L2 using LayerZero
        uint16 _dstChainId = srcChainId_;

        sendUsingLayerZero(
            _poolRegistry,
            LayerZeroParams({
                dstChainId: _dstChainId,
                amountIn: amount_,
                payload: abi.encode(_smartFarmingManager, _requestId),
                refundAddress: _account,
                dstGasForCall: _poolRegistry.flashRepayCallbackTxGasLimit(),
                dstNativeAmount: 0,
                nativeFee: _poolRegistry.quoter().quoteFlashRepayCallbackNativeFee(_dstChainId)
            })
        );
    }

    function _swap(
        IPoolRegistry poolRegistry_,
        uint256 requestId_,
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
        ISwapper _swapper = poolRegistry_.swapper();
        _safeApprove(IERC20(tokenIn_), address(_swapper), amountIn_);
        _amountOut = _swapper.swapExactInput({
            tokenIn_: tokenIn_,
            tokenOut_: tokenOut_,
            amountIn_: amountIn_,
            amountOutMin_: amountOutMin_,
            receiver_: address(this)
        });

        // 3. Clear stored slippage if swap succeeds
        swapAmountOutMin[requestId_] = 0;
    }

    /**
     * @notice Retry swap and trigger callback.
     * @param srcChainId_ srcChainId
     * @param srcAddress_ srcAddress
     * @param nonce_ nonce
     * @param amount_ amount
     * @param payload_ payload
     * @param newAmountOutMin_ If swap failed due to slippage, caller may send lower newAmountOutMin_
     */
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
            (address, uint256, uint256, address, uint256)
        );
        if (msg.sender != _account) revert InvalidMsgSender();

        swapAmountOutMin[_requestId] = newAmountOutMin_;

        // Note: `retryOFTReceived` has checks to ensure that the args are consistent
        bytes memory _from = abi.encodePacked(getProxyOFTOf(srcChainId_));
        this.retryOFTReceived(srcChainId_, srcAddress_, nonce_, _from, address(this), amount_, payload_);
    }

    /**
     * @notice Retry swap underlying and trigger callback.
     * @param srcChainId_ srcChainId
     * @param srcAddress_ srcAddress
     * @param nonce_ nonce
     * @param newAmountOutMin_ If swap failed due to slippage, caller may send lower newAmountOutMin_
     */
    function retrySwapUnderlyingAndTriggerCallback(
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint256 nonce_,
        uint256 newAmountOutMin_
    ) public {
        IStargateRouter _stargateRouter = syntheticToken.poolRegistry().stargateRouter();

        (, , , bytes memory _payload) = _stargateRouter.cachedSwapLookup(srcChainId_, srcAddress_, nonce_);
        (, uint256 _requestId, address _account, ) = abi.decode(_payload, (address, uint256, address, uint256));

        if (msg.sender != _account) revert InvalidMsgSender();

        swapAmountOutMin[_requestId] = newAmountOutMin_;

        _stargateRouter.clearCachedSwap(srcChainId_, srcAddress_, nonce_);
    }
}
