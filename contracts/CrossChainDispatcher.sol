// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import "./dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/external/IStargatePool.sol";
import "./interfaces/external/IStargateFactory.sol";
import "./storage/CrossChainDispatcherStorage.sol";
import "./interfaces/IProxyOFT.sol";
import "./interfaces/ISmartFarmingManager.sol";
import "./interfaces/ISyntheticToken.sol";
import "./interfaces/external/ISwapper.sol";
import "./lib/CrossChainLib.sol";

error AddressIsNull();
error InvalidMsgSender();
error BridgingIsPaused();
error InvalidFromAddress();
error NewValueIsSameAsCurrent();
error MsgSenderIsNotGovernor();
error DestinationChainNotAllowed();
error InvalidOperationType();

/**
 * @title Cross-chain dispatcher
 */
contract CrossChainDispatcher is Initializable, CrossChainDispatcherStorageV1 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    uint256 private constant MAX_BPS = 100_00;

    uint16 private constant LZ_ADAPTER_PARAMS_VERSION = 2;

    struct LayerZeroParams {
        address tokenIn;
        uint16 dstChainId;
        uint256 amountIn;
        uint256 nativeFee;
        bytes payload;
        address refundAddress;
        uint64 dstGasForCall;
        uint256 dstNativeAmount;
    }

    /// @notice Emitted when Lz base gas limit updated
    event LzBaseGasLimitUpdated(uint256 oldLzBaseGasLimit, uint256 newLzBaseGasLimit);

    /// @notice Emitted when Stargate router is updated
    event StargateRouterUpdated(IStargateRouter oldStargateRouter, IStargateRouter newStargateRouter);

    /// @notice Emitted when Stargate pool id is updated
    event StargatePoolIdUpdated(address indexed token, uint256 oldPoolId, uint256 newPoolId);

    /// @notice Emitted when Stargate slippage is updated
    event StargateSlippageUpdated(uint256 oldStargateSlippage, uint256 newStargateSlippage);

    /// @notice Emitted when synth->underlying L1 swap gas limit is updated
    event LeverageSwapTxGasLimitUpdated(uint64 oldSwapTxGasLimit, uint64 newSwapTxGasLimit);

    /// @notice Emitted when leverage callback gas limit is updated
    event LeverageCallbackTxGasLimitUpdated(uint64 oldCallbackTxGasLimit, uint64 newCallbackTxGasLimit);

    /// @notice Emitted when underlying->synth L1 swap gas limit is updated
    event FlashRepaySwapTxGasLimitUpdated(uint64 oldSwapTxGasLimit, uint64 newSwapTxGasLimit);

    /// @notice Emitted when flash repay callback gas limit is updated
    event FlashRepayCallbackTxGasLimitUpdated(uint64 oldCallbackTxGasLimit, uint64 newCallbackTxGasLimit);

    /// @notice Emitted when flag for pause bridge transfer is toggled
    event BridgingIsActiveUpdated(bool newIsActive);

    /// @notice Emitted when a Cross-chain dispatcher mapping is updated
    event CrossChainDispatcherUpdated(uint16 chainId, address oldCrossChainDispatcher, address newCrossChainDispatcher);

    modifier onlyGovernor() {
        if (msg.sender != poolRegistry.governor()) revert MsgSenderIsNotGovernor();
        _;
    }

    modifier onlyIfBridgingIsNotPaused() {
        if (!isBridgingActive) revert BridgingIsPaused();
        _;
    }

    modifier onlyIfSenderIsSmartFarmingManager() {
        IPool _pool = IManageable(msg.sender).pool();
        if (!poolRegistry.isPoolRegistered(address(_pool))) revert InvalidMsgSender();
        if (msg.sender != address(_pool.smartFarmingManager())) revert InvalidMsgSender();
        _;
    }

    modifier onlyIfSenderIsStargateRouter() {
        if (msg.sender != address(stargateRouter)) revert InvalidMsgSender();
        _;
    }

    // TODO: Improve code
    // TODO: Perhaps having a synthetic tokens mapping on PoolRegistry?
    modifier onlyIfSenderIsProxyOFT() {
        ISyntheticToken _syntheticToken = ISyntheticToken(IProxyOFT(msg.sender).token());
        bool _syntheticTokenExists;

        address[] memory _pools = poolRegistry.getPools();
        uint256 _length = _pools.length;
        for (uint256 i; i < _pools.length; ++i) {
            if (IPool(_pools[i]).doesSyntheticTokenExist(_syntheticToken)) {
                _syntheticTokenExists = true;
                break;
            }
        }

        if (!_syntheticTokenExists) revert InvalidMsgSender();
        if (msg.sender != address(_syntheticToken.proxyOFT())) revert InvalidMsgSender();
        _;
    }

    function initialize(IPoolRegistry poolRegistry_) external initializer {
        if (address(poolRegistry_) == address(0)) revert AddressIsNull();

        poolRegistry = poolRegistry_;
        stargateSlippage = 10; // 0.1%
        lzBaseGasLimit = 200_00;
        flashRepayCallbackTxGasLimit = 750_000;
        flashRepaySwapTxGasLimit = 500_000;
        leverageCallbackTxGasLimit = 750_000;
        leverageSwapTxGasLimit = 650_000;
    }

    /***
     * @notice Trigger swap using Stargate for flashRepay.
     * @param requestId_ Request id.
     * @param account_ User address and also refund address
     * @param tokenIn_ tokenIn
     * @param amountIn_ amountIn_
     * @param amountOutMin_ amountOutMin_
     * @param lzArgs_ LayerZero method argument
     */
    function triggerFlashRepaySwap(
        IProxyOFT proxyOFT_, // TODO: tokenOut (synth) instead?
        uint256 requestId_,
        address payable account_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable override onlyIfSenderIsSmartFarmingManager onlyIfBridgingIsNotPaused {
        (uint16 _dstChainId, uint256 callbackTxNativeFee_, uint64 flashRepaySwapTxGasLimit_) = CrossChainLib
            .decodeLzArgs(lzArgs_);

        if (address(proxyOFT_.getProxyOFTOf(_dstChainId)) == address(0)) revert DestinationChainNotAllowed();

        bytes memory _payload = CrossChainLib.encodeFlashRepaySwapPayload(
            proxyOFT_.getProxyOFTOf(_dstChainId),
            msg.sender,
            requestId_,
            account_,
            amountOutMin_
        );

        sendUsingStargate(
            LayerZeroParams({
                tokenIn: tokenIn_,
                dstChainId: _dstChainId,
                amountIn: amountIn_,
                nativeFee: msg.value,
                payload: _payload,
                refundAddress: account_,
                dstGasForCall: flashRepaySwapTxGasLimit_,
                dstNativeAmount: callbackTxNativeFee_
            })
        );
    }

    /***
     * @notice Send message using lz and trigger swap at destination chain.
     * @dev Not checking if bridging is pause because `_debitFrom()` will do it
     * @param requestId_ Request id.
     * @param account_ User address and also refund address
     * @param tokenOut_ tokenOut
     * @param amountIn_ amountIn
     * @param amountOutMin_ amountOutMin
     * @param lzArgs_ LayerZero method argument
     */
    function triggerLeverageSwap(
        IProxyOFT proxyOFT_, // TODO: tokenOut (synth) instead?
        uint256 requestId_,
        address payable account_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable override onlyIfSenderIsSmartFarmingManager onlyIfBridgingIsNotPaused {
        (uint16 _dstChainId, uint256 _callbackTxNativeFee, uint64 _leverageSwapTxGasLimit) = CrossChainLib.decodeLzArgs(
            lzArgs_
        );

        if (address(proxyOFT_.getProxyOFTOf(_dstChainId)) == address(0)) revert DestinationChainNotAllowed();

        bytes memory _payload = CrossChainLib.encodeLeverageSwapPayload(
            proxyOFT_.getProxyOFTOf(_dstChainId),
            msg.sender,
            requestId_,
            stargatePoolIdOf[tokenOut_],
            account_,
            amountOutMin_
        );

        sendUsingLayerZero(
            LayerZeroParams({
                tokenIn: proxyOFT_.token(),
                dstChainId: _dstChainId,
                amountIn: amountIn_,
                payload: _payload,
                refundAddress: account_,
                dstGasForCall: _leverageSwapTxGasLimit,
                dstNativeAmount: _callbackTxNativeFee,
                nativeFee: msg.value
            })
        );
    }

    function sendUsingStargate(LayerZeroParams memory params_) private {
        IStargateRouter.lzTxObj memory _lzTxParams;
        bytes memory _to = abi.encodePacked(crossChainDispatcherOf[params_.dstChainId]);
        {
            if (_to.toAddress(0) == address(0)) revert AddressIsNull();

            _lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: params_.dstGasForCall,
                dstNativeAmount: params_.dstNativeAmount,
                dstNativeAddr: (params_.dstNativeAmount > 0) ? _to : abi.encode(0)
            });
        }

        IERC20 _tokenIn = IERC20(params_.tokenIn);
        uint256 _poolId = stargatePoolIdOf[address(_tokenIn)];
        uint256 _amountOutMin = (params_.amountIn * (MAX_BPS - stargateSlippage)) / MAX_BPS;
        bytes memory _payload = params_.payload;

        IStargateRouter _stargateRouter = stargateRouter;
        _tokenIn.safeApprove(address(_stargateRouter), 0);
        _tokenIn.safeApprove(address(_stargateRouter), params_.amountIn);
        _stargateRouter.swap{value: params_.nativeFee}({
            _dstChainId: params_.dstChainId,
            _srcPoolId: _poolId,
            _dstPoolId: _poolId,
            _refundAddress: payable(params_.refundAddress),
            _amountLD: params_.amountIn,
            _minAmountLD: _amountOutMin,
            _lzTxParams: _lzTxParams,
            _to: _to,
            _payload: _payload
        });
    }

    function sendUsingLayerZero(LayerZeroParams memory params_) private {
        address _to = crossChainDispatcherOf[params_.dstChainId];
        if (_to == address(0)) revert AddressIsNull();

        bytes memory _adapterParams = abi.encodePacked(
            LZ_ADAPTER_PARAMS_VERSION,
            uint256(lzBaseGasLimit + params_.dstGasForCall),
            params_.dstNativeAmount,
            (params_.dstNativeAmount > 0) ? _to : address(0)
        );

        ISyntheticToken(params_.tokenIn).proxyOFT().sendAndCall{value: params_.nativeFee}({
            _from: address(this),
            _dstChainId: params_.dstChainId,
            _toAddress: abi.encodePacked(_to),
            _amount: params_.amountIn,
            _payload: params_.payload,
            _dstGasForCall: params_.dstGasForCall,
            _refundAddress: payable(params_.refundAddress),
            _zroPaymentAddress: address(0),
            _adapterParams: _adapterParams
        });
    }

    /**
     * @notice Called by the OFT contract when tokens are received from source chain.
     * @dev Token received are swapped to another token
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
    ) external override onlyIfSenderIsProxyOFT {
        address _from = from_.toAddress(0);
        if (_from == address(0) || _from != crossChainDispatcherOf[srcChainId_]) revert InvalidFromAddress();

        uint8 _op = CrossChainLib.getOperationType(payload_);

        if (_op == CrossChainLib.FLASH_REPAY) {
            _crossChainFlashRepayCallback(amount_, payload_);
        } else if (_op == CrossChainLib.LEVERAGE) {
            _swapAndTriggerLeverageCallback(srcChainId_, amount_, payload_);
        } else {
            revert InvalidOperationType();
        }
    }

    function _crossChainFlashRepayCallback(uint amount_, bytes calldata payload_) private {
        (address proxyOFT_, address _smartFarmingManager, uint256 _requestId) = CrossChainLib
            .decodeFlashRepayCallbackPayload(payload_);

        IERC20 _syntheticToken = IERC20(IProxyOFT(proxyOFT_).token());
        _syntheticToken.safeApprove(_smartFarmingManager, 0);
        _syntheticToken.safeApprove(_smartFarmingManager, amount_);
        ISmartFarmingManager(_smartFarmingManager).crossChainFlashRepayCallback(_requestId, amount_);
    }

    /**
     * @notice Receive token and payload from Stargate
     * @param srcChainId_ The chain id of the source chain.
     * @param srcAddress_ The remote Bridge address
     * @param token_ The token contract on the local chain
     * @param amountLD_ The qty of local _token contract tokens
     * @param payload_ The bytes containing the _tokenOut, _deadline, _amountOutMin, _toAddr
     */
    function sgReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint256 /*nonce_*/,
        address token_,
        uint256 amountLD_,
        bytes memory payload_
    ) external override onlyIfSenderIsStargateRouter {
        if (abi.decode(srcAddress_, (address)) != crossChainDispatcherOf[srcChainId_]) revert InvalidFromAddress();

        uint8 _op = CrossChainLib.getOperationType(payload_);

        if (_op == CrossChainLib.LEVERAGE) {
            _crossChainLeverageCallback(token_, amountLD_, payload_);
        } else if (_op == CrossChainLib.FLASH_REPAY) {
            _swapAndTriggerFlashRepayCallback(srcChainId_, srcAddress_, token_, amountLD_, payload_);
        } else {
            revert InvalidOperationType();
        }
    }

    function _crossChainLeverageCallback(address token_, uint256 amount_, bytes memory payload_) private {
        (address _smartFarmingManager, uint256 _requestId) = CrossChainLib.decodeLeverageCallbackPayload(payload_);
        IERC20(token_).safeApprove(_smartFarmingManager, 0);
        IERC20(token_).safeApprove(_smartFarmingManager, amount_);
        ISmartFarmingManager(_smartFarmingManager).crossChainLeverageCallback(_requestId, amount_);
    }

    function _swapAndTriggerLeverageCallback(uint16 srcChainId_, uint amountIn_, bytes calldata payload_) private {
        // 1. Swap synthetic token from source chain for underlying
        (
            address _proxyOFT,
            address _smartFarmingManager,
            uint256 _requestId,
            uint256 _underlyingPoolId,
            address _account,
            uint256 _amountOutMin
        ) = CrossChainLib.decodeLeverageSwapPayload(payload_);

        address _underlying = IStargatePool(IStargateFactory(stargateRouter.factory()).getPool(_underlyingPoolId))
            .token();

        amountIn_ = _swap({
            requestId_: _requestId,
            tokenIn_: IProxyOFT(_proxyOFT).token(),
            tokenOut_: _underlying,
            amountIn_: amountIn_,
            amountOutMin_: _amountOutMin
        });

        // 2. Transfer underlying to L2 using Stargate
        uint16 _dstChainId = srcChainId_;

        sendUsingStargate(
            LayerZeroParams({
                tokenIn: _underlying,
                dstChainId: _dstChainId,
                amountIn: amountIn_,
                nativeFee: poolRegistry.quoter().quoteLeverageCallbackNativeFee(_dstChainId),
                payload: CrossChainLib.encodeLeverageCallbackPayload(_smartFarmingManager, _requestId),
                refundAddress: _account,
                dstGasForCall: leverageCallbackTxGasLimit,
                dstNativeAmount: 0
            })
        );
    }

    function _swapAndTriggerFlashRepayCallback(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        address token_,
        uint256 amount_,
        bytes memory payload_
    ) private {
        // 1. Swap underlying from source chain for synthetic token
        (
            address _proxyOFT,
            address _smartFarmingManager,
            uint256 _requestId,
            address _account,
            uint256 _amountOutMin
        ) = CrossChainLib.decodeFlashRepaySwapPayload(payload_);

        if (abi.decode(srcAddress_, (address)) != crossChainDispatcherOf[srcChainId_]) revert InvalidFromAddress();

        address _syntheticToken = IProxyOFT(_proxyOFT).token();
        amount_ = _swap({
            requestId_: _requestId,
            tokenIn_: token_,
            tokenOut_: _syntheticToken,
            amountIn_: amount_,
            amountOutMin_: _amountOutMin
        });

        // 2. Transfer synthetic token to source chain using LayerZero
        uint16 _dstChainId = srcChainId_;
        address _dstProxyOFT = IProxyOFT(_proxyOFT).getProxyOFTOf(srcChainId_);

        sendUsingLayerZero(
            LayerZeroParams({
                tokenIn: _syntheticToken,
                dstChainId: _dstChainId,
                amountIn: amount_,
                payload: CrossChainLib.encodeFlashRepayCallbackPayload(_dstProxyOFT, _smartFarmingManager, _requestId),
                refundAddress: _account,
                dstGasForCall: flashRepayCallbackTxGasLimit,
                dstNativeAmount: 0,
                nativeFee: poolRegistry.quoter().quoteFlashRepayCallbackNativeFee(_dstChainId)
            })
        );
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
    function retrySwapAndTriggerLeverageCallback(
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint64 nonce_,
        uint amount_,
        bytes calldata payload_,
        uint256 newAmountOutMin_
    ) external {
        (address _proxyOFT, , uint256 _requestId, , address _account, ) = CrossChainLib.decodeLeverageSwapPayload(
            payload_
        );
        if (msg.sender != _account) revert InvalidMsgSender();

        swapAmountOutMin[_requestId] = newAmountOutMin_;

        // Note: `retryOFTReceived()` has checks to ensure that the args are consistent
        bytes memory _from = abi.encodePacked(crossChainDispatcherOf[srcChainId_]);
        IProxyOFT(_proxyOFT).retryOFTReceived(
            srcChainId_,
            srcAddress_,
            nonce_,
            _from,
            address(this),
            amount_,
            payload_
        );
    }

    /**
     * @notice Retry swap underlying and trigger callback.
     * @param srcChainId_ srcChainId
     * @param srcAddress_ srcAddress
     * @param nonce_ nonce
     * @param newAmountOutMin_ If swap failed due to slippage, caller may send lower newAmountOutMin_
     */
    function retrySwapAndTriggerFlashRepayCallback(
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint256 nonce_,
        uint256 newAmountOutMin_
    ) external {
        IStargateRouter _stargateRouter = stargateRouter;

        (, , , bytes memory _payload) = _stargateRouter.cachedSwapLookup(srcChainId_, srcAddress_, nonce_);
        (, , uint256 _requestId, address _account, ) = CrossChainLib.decodeFlashRepaySwapPayload(_payload);

        if (msg.sender != _account) revert InvalidMsgSender();

        swapAmountOutMin[_requestId] = newAmountOutMin_;

        _stargateRouter.clearCachedSwap(srcChainId_, srcAddress_, nonce_);
    }

    /**
     * @dev Perform a swap considering slippage param from user
     */
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
            // Use stored slippage and clear it
            amountOutMin_ = _storedAmountOutMin;
            swapAmountOutMin[requestId_] = 0;
        }

        // 2. Perform swap
        ISwapper _swapper = poolRegistry.swapper();
        IERC20(tokenIn_).safeApprove(address(_swapper), 0);
        IERC20(tokenIn_).safeApprove(address(_swapper), amountIn_);
        _amountOut = _swapper.swapExactInput({
            tokenIn_: tokenIn_,
            tokenOut_: tokenOut_,
            amountIn_: amountIn_,
            amountOutMin_: amountOutMin_,
            receiver_: address(this)
        });
    }

    /**
     * @notice Update flash repay callback tx gas limit
     */
    function updateFlashRepayCallbackTxGasLimit(uint64 newFlashRepayCallbackTxGasLimit_) external onlyGovernor {
        uint64 _currentFlashRepayCallbackTxGasLimit = flashRepayCallbackTxGasLimit;
        if (newFlashRepayCallbackTxGasLimit_ == _currentFlashRepayCallbackTxGasLimit) revert NewValueIsSameAsCurrent();
        emit FlashRepayCallbackTxGasLimitUpdated(
            _currentFlashRepayCallbackTxGasLimit,
            newFlashRepayCallbackTxGasLimit_
        );
        flashRepayCallbackTxGasLimit = newFlashRepayCallbackTxGasLimit_;
    }

    /**
     * @notice Update flash repay swap tx gas limit
     */
    function updateFlashRepaySwapTxGasLimit(uint64 newFlashRepaySwapTxGasLimit_) external onlyGovernor {
        uint64 _currentFlashRepaySwapTxGasLimit = flashRepaySwapTxGasLimit;
        if (newFlashRepaySwapTxGasLimit_ == _currentFlashRepaySwapTxGasLimit) revert NewValueIsSameAsCurrent();
        emit FlashRepaySwapTxGasLimitUpdated(_currentFlashRepaySwapTxGasLimit, newFlashRepaySwapTxGasLimit_);
        flashRepaySwapTxGasLimit = newFlashRepaySwapTxGasLimit_;
    }

    /**
     * @notice Update leverage callback tx gas limit
     */
    function updateLeverageCallbackTxGasLimit(uint64 newLeverageCallbackTxGasLimit_) external onlyGovernor {
        uint64 _currentLeverageCallbackTxGasLimit = leverageCallbackTxGasLimit;
        if (newLeverageCallbackTxGasLimit_ == _currentLeverageCallbackTxGasLimit) revert NewValueIsSameAsCurrent();
        emit LeverageCallbackTxGasLimitUpdated(_currentLeverageCallbackTxGasLimit, newLeverageCallbackTxGasLimit_);
        leverageCallbackTxGasLimit = newLeverageCallbackTxGasLimit_;
    }

    /**
     * @notice Update leverage swap tx gas limit
     */
    function updateLeverageSwapTxGasLimit(uint64 newLeverageSwapTxGasLimit_) external onlyGovernor {
        uint64 _currentSwapTxGasLimit = leverageSwapTxGasLimit;
        if (newLeverageSwapTxGasLimit_ == _currentSwapTxGasLimit) revert NewValueIsSameAsCurrent();
        emit LeverageSwapTxGasLimitUpdated(_currentSwapTxGasLimit, newLeverageSwapTxGasLimit_);
        leverageSwapTxGasLimit = newLeverageSwapTxGasLimit_;
    }

    /**
     * @notice Update Lz base gas limit
     */
    function updateLzBaseGasLimit(uint256 newLzBaseGasLimit_) external onlyGovernor {
        uint256 _currentBaseGasLimit = lzBaseGasLimit;
        if (newLzBaseGasLimit_ == _currentBaseGasLimit) revert NewValueIsSameAsCurrent();
        emit LzBaseGasLimitUpdated(_currentBaseGasLimit, newLzBaseGasLimit_);
        lzBaseGasLimit = newLzBaseGasLimit_;
    }

    /**
     * @notice Update Stargate pool id of token.
     * @dev Use LZ ids (https://stargateprotocol.gitbook.io/stargate/developers/pool-ids)
     */
    function updateStargatePoolIdOf(address token_, uint256 newPoolId_) external onlyGovernor {
        uint256 _currentPoolId = stargatePoolIdOf[token_];
        if (newPoolId_ == _currentPoolId) revert NewValueIsSameAsCurrent();
        emit StargatePoolIdUpdated(token_, _currentPoolId, newPoolId_);
        stargatePoolIdOf[token_] = newPoolId_;
    }

    /**
     * @notice Update Stargate slippage
     */
    function updateStargateSlippage(uint256 newStargateSlippage_) external onlyGovernor {
        uint256 _currentStargateSlippage = stargateSlippage;
        if (newStargateSlippage_ == _currentStargateSlippage) revert NewValueIsSameAsCurrent();
        emit StargateSlippageUpdated(_currentStargateSlippage, newStargateSlippage_);
        stargateSlippage = newStargateSlippage_;
    }

    /**
     * @notice Update StargateRouter
     */
    function updateStargateRouter(IStargateRouter newStargateRouter_) external onlyGovernor {
        IStargateRouter _currentStargateRouter = stargateRouter;
        if (newStargateRouter_ == _currentStargateRouter) revert NewValueIsSameAsCurrent();
        emit StargateRouterUpdated(_currentStargateRouter, newStargateRouter_);
        stargateRouter = newStargateRouter_;
    }

    /**
     * @notice Pause/Unpause bridge transfers
     */
    function toggleBridgingIsActive() external onlyGovernor {
        bool _newIsBridgingActive = !isBridgingActive;
        emit BridgingIsActiveUpdated(_newIsBridgingActive);
        isBridgingActive = _newIsBridgingActive;
    }

    /**
     * @notice Update Cross-chain dispatcher mapping
     */
    function updateCrossChainDispatcherOf(uint16 chainId_, address crossChainDispatcher_) external onlyGovernor {
        address _current = crossChainDispatcherOf[chainId_];
        if (crossChainDispatcher_ == _current) revert NewValueIsSameAsCurrent();
        emit CrossChainDispatcherUpdated(chainId_, _current, crossChainDispatcher_);
        crossChainDispatcherOf[chainId_] = crossChainDispatcher_;
    }
}
