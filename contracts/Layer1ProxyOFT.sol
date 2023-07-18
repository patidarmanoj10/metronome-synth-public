// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./ProxyOFT.sol";
import "./storage/Layer1ProxyOFTStorage.sol";
import "./interfaces/external/IStargatePool.sol";
import "./interfaces/external/IStargateFactory.sol";

// TODO: Comment functions
contract Layer1ProxyOFT is ProxyOFT, Layer1ProxyOFTStorage {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using BytesLib for bytes;
    using SmartFarming for IPoolRegistry;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) public initializer {
        __ProxyOFT_init(_lzEndpoint, syntheticToken_);
    }

    function getLeverageSwapAndCallbackLzArgs(uint16 dstChainId_) external view returns (bytes memory lzArgs_) {
        return syntheticToken.poolRegistry().getLeverageSwapAndCallbackLzArgs(dstChainId_);
    }

    function getFlashRepaySwapAndCallbackLzArgs(uint16 dstChainId_) external view returns (bytes memory lzArgs_) {
        return syntheticToken.poolRegistry().getFlashRepaySwapAndCallbackLzArgs(dstChainId_);
    }

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
        uint256 _amountOut;
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

            _amountOut = _swap({
                requestId_: _requestId,
                tokenIn_: address(syntheticToken),
                tokenOut_: _underlying,
                amountIn_: amount_,
                amountOutMin_: _amountOutMin
            });
        }

        // 2. Transfer underlying to L2 using Stargate
        uint16 _dstChainId = srcChainId_;
        // Note: The amount  isn't needed here because it's part of the message
        bytes memory _payload = abi.encode(_smartFarmingManager, _requestId); // Stack too deep

        _poolRegistry.swapUsingStargate(
            SmartFarming.StargateParams({
                tokenIn: _underlying,
                dstChainId: _dstChainId,
                amountIn: _amountOut,
                nativeFee: _poolRegistry.quoteLeverageCallbackNativeFee(_dstChainId),
                payload: _payload,
                refundAddress: _account,
                dstGasForCall: _poolRegistry.leverageCallbackTxGasLimit(),
                dstNativeAmount: 0
            })
        );
    }

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
        address _smartFarmingManager;
        uint256 _requestId;
        uint256 _amountOut;
        address _account;
        {
            uint256 _amountOutMin;

            (_smartFarmingManager, _requestId, _account, _amountOutMin) = abi.decode(
                payload_,
                (address, uint256, address, uint256)
            );

            _amountOut = _swap({
                requestId_: _requestId,
                tokenIn_: token_,
                tokenOut_: address(syntheticToken),
                amountIn_: amount_,
                amountOutMin_: _amountOutMin
            });
        }

        {
            // 2. Transfer synthetic token to L2 using LayerZero
            uint16 _dstChainId = srcChainId_;
            uint64 _flashRepayCallbackTxGasLimit = _poolRegistry.flashRepayCallbackTxGasLimit();

            _poolRegistry.sendUsingLayerZero(
                SmartFarming.LayerZeroParams({
                    dstChainId: _dstChainId,
                    amountIn: _amountOut,
                    payload: abi.encode(_smartFarmingManager, _requestId),
                    refundAddress: _account,
                    dstGasForCall: _flashRepayCallbackTxGasLimit,
                    dstNativeAmount: 0,
                    nativeFee: _poolRegistry.quoteFlashRepayCallbackNativeFee(_dstChainId)
                })
            );
        }
    }

    function _swap(
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

        _amountOut = syntheticToken.poolRegistry().swap({
            tokenIn_: tokenIn_,
            tokenOut_: tokenOut_,
            amountIn_: amountIn_,
            amountOutMin_: amountOutMin_
        });

        // 3. Clear stored slippage if swap succeeds
        _storedAmountOutMin = 0;
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
        address _to = address(this);
        this.retryOFTReceived(srcChainId_, srcAddress_, nonce_, _from, _to, amount_, payload_);
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
