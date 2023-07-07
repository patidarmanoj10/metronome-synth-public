// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/ILayer2ProxyOFT.sol";
import "./ProxyOFT.sol";

contract Layer2ProxyOFT is ILayer2ProxyOFT, ProxyOFT {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    // TODO: Create setter for this
    uint16 public lzMainnetChainId = 101;

    ISwapper public swapper;

    constructor(address _lzEndpoint, ISyntheticToken syntheticToken_) ProxyOFT(_lzEndpoint, syntheticToken_) {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
    }

    function quoteTriggerFlashRepaySwapNativeFee(
        address l2Pool_,
        address /*tokenIn_*/,
        uint256 /*amountIn_*/,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        bytes memory _mainnetOFT = abi.encodePacked(_getProxyOftOf(lzMainnetChainId));

        (uint256 _callbackTxNativeFee, uint64 _swapTxGasLimit_, uint64 _callbackTxGasLimit_) = abi.decode(
            lzArgs_,
            (uint256, uint64, uint64)
        );

        (_nativeFee, ) = stargateRouter.quoteLayerZeroFee({
            _dstChainId: lzMainnetChainId,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: _mainnetOFT,
            _transferAndCallPayload: abi.encodePacked(
                l2Pool_,
                bytes32(type(uint256).max), // requestId
                address(type(uint160).max), // account
                amountOutMin_
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: _swapTxGasLimit_ + _callbackTxGasLimit_,
                dstNativeAmount: _callbackTxNativeFee,
                dstNativeAddr: _mainnetOFT
            })
        });
    }

    function quoteTriggerLeverageSwapNativeFee(
        address l2Pool_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) public view override returns (uint256 _nativeFee) {
        address _mainnetOFT = _getProxyOftOf(lzMainnetChainId);
        bytes memory _payload;
        bytes memory _adapterParams;
        uint64 _callbackTxGasLimit;
        {
            _payload = abi.encode(
                l2Pool_,
                bytes32(type(uint256).max), // requestId
                poolIdOf[tokenOut_],
                address(type(uint160).max), // account
                amountOutMin_
            );

            uint256 _callbackTxNativeFee;
            uint64 _swapTxGasLimit;
            (_callbackTxNativeFee, _swapTxGasLimit, _callbackTxGasLimit) = abi.decode(
                lzArgs_,
                (uint256, uint64, uint64)
            );

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(_swapTxGasLimit + _callbackTxGasLimit),
                _callbackTxNativeFee,
                _mainnetOFT
            );
        }

        (uint256 _swapTxNativeFee, ) = this.estimateSendAndCallFee({
            _dstChainId: lzMainnetChainId,
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
        bytes calldata lzArgs_
    ) external payable override {
        if (!syntheticToken.poolRegistry().isPoolRegistered(msg.sender)) revert InvalidMsgSender();

        bytes memory _payload;
        bytes memory _mainnetOFT;
        IStargateRouter.lzTxObj memory _lzTxParams;
        {
            // Note: The amount isn't needed here because it's part of the message
            _payload = abi.encode(msg.sender, requestId_, account_, amountOutMin_);
            _mainnetOFT = abi.encodePacked(_getProxyOftOf(lzMainnetChainId));
            IStargateRouter _stargateRouter = stargateRouter;
            IERC20(tokenIn_).safeApprove(address(_stargateRouter), 0);
            IERC20(tokenIn_).safeApprove(address(_stargateRouter), amountIn_);

            (uint256 callbackTxNativeFee_, uint64 flashRepaySwapTxGasLimit_, uint64 flashRepayCallbackTxGasLimit_) = abi
                .decode(lzArgs_, (uint256, uint64, uint64));

            _lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: flashRepaySwapTxGasLimit_ + flashRepayCallbackTxGasLimit_,
                dstNativeAmount: callbackTxNativeFee_,
                dstNativeAddr: _mainnetOFT
            });
        }

        // Note: Using `_stargateRouter` here will throw "Stack too deep" error
        stargateRouter.swap{value: msg.value}({
            _dstChainId: lzMainnetChainId,
            _srcPoolId: poolIdOf[tokenIn_],
            _dstPoolId: poolIdOf[tokenIn_],
            _refundAddress: account_,
            _amountLD: amountIn_,
            _minAmountLD: _getSgAmountInMin(amountIn_),
            _lzTxParams: _lzTxParams,
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
        bytes calldata lzArgs_
    ) external payable override {
        if (!syntheticToken.poolRegistry().isPoolRegistered(msg.sender)) revert InvalidMsgSender();

        address payable _refundAddress = account_; // Stack too deep

        address _mainnetOFT = _getProxyOftOf(lzMainnetChainId);
        bytes memory _payload;
        bytes memory _adapterParams;
        uint64 _leverageCallbackTxGasLimit;
        {
            // Note: The amount isn't needed here because it's part of the message
            _payload = abi.encode(msg.sender, requestId_, poolIdOf[tokenOut_], account_, amountOutMin_);

            uint256 _callbackTxNativeFee;
            uint64 _leverageSwapTxGasLimit;
            (_callbackTxNativeFee, _leverageSwapTxGasLimit, _leverageCallbackTxGasLimit) = abi.decode(
                lzArgs_,
                (uint256, uint64, uint64)
            );

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(_leverageSwapTxGasLimit + _leverageCallbackTxGasLimit),
                _callbackTxNativeFee,
                _mainnetOFT
            );
        }

        this.sendAndCall{value: msg.value}({
            _from: address(this),
            _dstChainId: lzMainnetChainId,
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

    function onOFTReceived(
        uint16 srcChainId_,
        bytes calldata /*srcAddress_*/,
        uint64 /*nonce_*/,
        bytes calldata from_,
        uint amount_,
        bytes calldata payload_
    ) external override {
        if (from_.toAddress(0) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
        if (srcChainId_ != lzMainnetChainId) revert InvalidSourceChain();

        (address _poolAddress, uint256 _layer2FlashRepayId) = abi.decode(payload_, (address, uint256));

        IERC20 _syntheticToken = syntheticToken;

        _syntheticToken.safeApprove(_poolAddress, 0);
        _syntheticToken.safeApprove(_poolAddress, amount_);
        IPool(_poolAddress).layer2FlashRepayCallback(_layer2FlashRepayId, amount_);
    }

    function sgReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint256 /*nonce_*/,
        address token_,
        uint256 amountLD_,
        bytes memory payload_
    ) external override {
        if (abi.decode(srcAddress_, (address)) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
        if (srcChainId_ != lzMainnetChainId) revert InvalidSourceChain();
        if (msg.sender != address(stargateRouter)) revert InvalidMsgSender();

        (address _poolAddress, uint256 _layer2LeverageId) = abi.decode(payload_, (address, uint256));

        IERC20(token_).safeApprove(_poolAddress, 0);
        IERC20(token_).safeApprove(_poolAddress, amountLD_);
        IPool(_poolAddress).layer2LeverageCallback(_layer2LeverageId, amountLD_);
    }
}
