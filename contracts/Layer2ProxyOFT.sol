// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/ILayer2ProxyOFT.sol";
import "./interfaces/ISmartFarmingManager.sol";
import "./ProxyOFT.sol";
import "./storage/Layer2ProxyOFTStorage.sol";

contract Layer2ProxyOFT is ILayer2ProxyOFT, ProxyOFT, Layer2ProxyOFTStorage {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) public initializer {
        __ProxyOFT_init(_lzEndpoint, syntheticToken_);
        if (block.chainid == 1) revert NotAvailableOnThisChain();

        lzMainnetChainId = 101;
    }

    modifier onlyIfMsgSenderIsValid() {
        IPool _pool = IManageable(msg.sender).pool();
        if (!syntheticToken.poolRegistry().isPoolRegistered(address(_pool))) revert InvalidMsgSender();
        if (msg.sender != address(_pool.smartFarmingManager())) revert InvalidMsgSender();
        _;
    }

    // TODO: Move abi.decode to SFM as way to document lzArgs encoded data there?
    function quoteTriggerFlashRepaySwapNativeFee(bytes calldata lzArgs_) external view returns (uint256 _nativeFee) {
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
                address(type(uint160).max), // L2 smart farming manager
                bytes32(type(uint256).max), // requestId
                address(type(uint160).max), // account
                type(uint256).max // amountOutMin_
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: _swapTxGasLimit_ + _callbackTxGasLimit_,
                dstNativeAmount: _callbackTxNativeFee,
                dstNativeAddr: _mainnetOFT
            })
        });
    }

    // TODO: Move abi.decode to SFM as way to document lzArgs encoded data there?
    function quoteTriggerLeverageSwapNativeFee(
        bytes calldata lzArgs_
    ) public view override returns (uint256 _nativeFee) {
        address _mainnetOFT = _getProxyOftOf(lzMainnetChainId);
        bytes memory _payload;
        bytes memory _adapterParams;
        uint64 _callbackTxGasLimit;
        {
            _payload = abi.encode(
                address(type(uint160).max), // L2 smart farming manager
                bytes32(type(uint256).max), // requestId
                type(uint256).max, // sgPoolId
                address(type(uint160).max), // account
                type(uint256).max // amountOutMin_
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
            _amount: type(uint256).max,
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
    ) external payable override onlyIfMsgSenderIsValid {
        // Stack too deep
        uint256 _amountIn = amountIn_;
        address payable _account = account_;

        IStargateRouter _stargateRouter = stargateRouter;

        bytes memory _payload;
        bytes memory _mainnetOFT;
        IStargateRouter.lzTxObj memory _lzTxParams;
        {
            // Note: The amount isn't needed here because it's part of the message
            _payload = abi.encode(msg.sender, requestId_, account_, amountOutMin_);
            _mainnetOFT = abi.encodePacked(_getProxyOftOf(lzMainnetChainId));
            IERC20(tokenIn_).safeApprove(address(_stargateRouter), 0);
            IERC20(tokenIn_).safeApprove(address(_stargateRouter), _amountIn);

            (uint256 callbackTxNativeFee_, uint64 flashRepaySwapTxGasLimit_, uint64 flashRepayCallbackTxGasLimit_) = abi
                .decode(lzArgs_, (uint256, uint64, uint64));

            _lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: flashRepaySwapTxGasLimit_ + flashRepayCallbackTxGasLimit_,
                dstNativeAmount: callbackTxNativeFee_,
                dstNativeAddr: _mainnetOFT
            });
        }

        uint256 _poolId = poolIdOf[tokenIn_];

        _stargateRouter.swap{value: msg.value}({
            _dstChainId: lzMainnetChainId,
            _srcPoolId: _poolId,
            _dstPoolId: _poolId,
            _refundAddress: _account,
            _amountLD: _amountIn,
            _minAmountLD: _getSgAmountOutMin(_amountIn),
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
    ) external payable override onlyIfMsgSenderIsValid {
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
        if (msg.sender != address(this)) revert InvalidMsgSender();
        if (from_.toAddress(0) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
        if (srcChainId_ != lzMainnetChainId) revert InvalidSourceChain();

        (address _smartFarmingManager, uint256 _layer2FlashRepayId) = abi.decode(payload_, (address, uint256));

        IERC20 _syntheticToken = syntheticToken;

        _syntheticToken.safeApprove(_smartFarmingManager, 0);
        _syntheticToken.safeApprove(_smartFarmingManager, amount_);
        ISmartFarmingManager(_smartFarmingManager).layer2FlashRepayCallback(_layer2FlashRepayId, amount_);
    }

    function sgReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint256 /*nonce_*/,
        address token_,
        uint256 amountLD_,
        bytes memory payload_
    ) external override {
        if (msg.sender != address(stargateRouter)) revert InvalidMsgSender();
        if (abi.decode(srcAddress_, (address)) != _getProxyOftOf(srcChainId_)) revert InvalidFromAddress();
        if (srcChainId_ != lzMainnetChainId) revert InvalidSourceChain();

        (address _smartFarmingManager, uint256 _layer2LeverageId) = abi.decode(payload_, (address, uint256));

        IERC20(token_).safeApprove(_smartFarmingManager, 0);
        IERC20(token_).safeApprove(_smartFarmingManager, amountLD_);
        ISmartFarmingManager(_smartFarmingManager).layer2LeverageCallback(_layer2LeverageId, amountLD_);
    }
}
