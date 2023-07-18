// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;
import "../dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "../dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import "../dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/interfaces/ILayerZeroEndpointUpgradeable.sol";
import "../interfaces/IPoolRegistry.sol";
import "../interfaces/ISyntheticToken.sol";
import "../interfaces/external/IStargateBridge.sol";

error AddressIsNull();

/**
 * @title Smarting Farming utils lib
 */
library SmartFarming {
    using BytesLib for bytes;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BPS = 100_00;

    // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
    uint16 public constant LZ_ADAPTER_PARAMS_VERSION = 2;

    // See more: https://stargateprotocol.gitbook.io/stargate/developers/function-types
    uint8 public constant SG_TYPE_SWAP_REMOTE = 1;

    uint16 public constant PT_SEND_AND_CALL = 1;

    function getLeverageSwapAndCallbackLzArgs(
        IPoolRegistry poolRegistry_,
        uint16 dstChainId_
    ) external view returns (bytes memory lzArgs_) {
        return
            abi.encode(
                quoteLeverageCallbackNativeFee(poolRegistry_, dstChainId_),
                poolRegistry_.leverageSwapTxGasLimit()
            );
    }

    function getFlashRepaySwapAndCallbackLzArgs(
        IPoolRegistry poolRegistry_,
        uint16 dstChainId_
    ) external view returns (bytes memory lzArgs_) {
        return
            abi.encode(
                quoteFlashRepayCallbackNativeFee(poolRegistry_, dstChainId_),
                poolRegistry_.flashRepaySwapTxGasLimit()
            );
    }

    function quoteLeverageCallbackNativeFee(
        IPoolRegistry poolRegistry_,
        uint16 dstChainId_
    ) public view returns (uint256 _callbackTxNativeFee) {
        (_callbackTxNativeFee, ) = poolRegistry_.stargateRouter().quoteLayerZeroFee({
            _dstChainId: dstChainId_,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: abi.encodePacked(address(type(uint160).max)),
            _transferAndCallPayload: abi.encodePacked(
                address(type(uint160).max), // smart farming manager
                bytes32(type(uint256).max) // requestId
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: poolRegistry_.leverageCallbackTxGasLimit(),
                dstNativeAmount: 0,
                dstNativeAddr: "0x"
            })
        });
    }

    function quoteFlashRepayCallbackNativeFee(
        IPoolRegistry poolRegistry_,
        uint16 dstChainId_
    ) public view returns (uint256 _callbackTxNativeFee) {
        uint64 _flashRepayCallbackTxGasLimit = poolRegistry_.flashRepayCallbackTxGasLimit();

        bytes memory payload = abi.encode(
            PT_SEND_AND_CALL,
            abi.encodePacked(msg.sender),
            abi.encodePacked(address(type(uint160).max)),
            type(uint256).max,
            abi.encode(
                address(type(uint160).max), // smart farming manager
                bytes32(type(uint256).max) // requestId
            ),
            _flashRepayCallbackTxGasLimit
        );

        ILayerZeroEndpoint _lzEndpoint = IStargateBridge(poolRegistry_.stargateRouter().bridge()).layerZeroEndpoint();

        (_callbackTxNativeFee, ) = _lzEndpoint.estimateFees(
            dstChainId_,
            address(this),
            payload,
            false,
            abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(poolRegistry_.lzBaseGasLimit() + _flashRepayCallbackTxGasLimit),
                uint256(0),
                address(0)
            )
        );
    }

    /**
     * @notice Get the LZ (native) fee for the `triggerFlashRepay()` call
     * @param lzArgs_ The LZ args for L1 transaction
     * @return _nativeFee The fee in native coin
     */
    function quoteTriggerFlashRepaySwapNativeFee(
        IPoolRegistry poolRegistry_,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        uint16 _lzMainnetChainId = poolRegistry_.lzMainnetChainId();
        bytes memory _mainnetOFT = abi.encodePacked(IProxyOFT(address(this)).getProxyOFTOf(_lzMainnetChainId));

        (uint256 _callbackTxNativeFee, uint64 _swapTxGasLimit_) = abi.decode(lzArgs_, (uint256, uint64));

        (_nativeFee, ) = poolRegistry_.stargateRouter().quoteLayerZeroFee({
            _dstChainId: _lzMainnetChainId,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: _mainnetOFT,
            _transferAndCallPayload: abi.encodePacked(
                address(type(uint160).max), // L2 smart farming manager
                bytes32(type(uint256).max), // requestId
                address(type(uint160).max), // account
                type(uint256).max // amountOutMin_
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: _swapTxGasLimit_,
                dstNativeAmount: _callbackTxNativeFee,
                dstNativeAddr: _mainnetOFT
            })
        });
    }

    function quoteTriggerLeverageSwapNativeFee(
        IPoolRegistry poolRegistry_,
        bytes calldata lzArgs_
    ) public view returns (uint256 _nativeFee) {
        uint16 _lzMainnetChainId = poolRegistry_.lzMainnetChainId();
        address _mainnetOFT = IProxyOFT(address(this)).getProxyOFTOf(_lzMainnetChainId);
        bytes memory _payload;
        bytes memory _adapterParams;
        uint64 _swapTxGasLimit;
        {
            _payload = abi.encode(
                address(type(uint160).max), // L2 smart farming manager
                bytes32(type(uint256).max), // requestId
                type(uint256).max, // sgPoolId
                address(type(uint160).max), // account
                type(uint256).max // amountOutMin_
            );

            uint256 _callbackTxNativeFee;
            (_callbackTxNativeFee, _swapTxGasLimit) = abi.decode(lzArgs_, (uint256, uint64));

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(poolRegistry_.lzBaseGasLimit() + _swapTxGasLimit),
                _callbackTxNativeFee,
                _mainnetOFT
            );
        }

        (uint256 _swapTxNativeFee, ) = IProxyOFT(address(this)).estimateSendAndCallFee({
            _dstChainId: _lzMainnetChainId,
            _toAddress: abi.encodePacked(_mainnetOFT),
            _amount: type(uint256).max,
            _payload: _payload,
            _dstGasForCall: _swapTxGasLimit,
            _useZro: false,
            _adapterParams: _adapterParams
        });

        return _swapTxNativeFee;
    }

    struct StargateParams {
        address tokenIn;
        uint16 dstChainId;
        uint256 amountIn;
        uint256 nativeFee;
        bytes payload;
        address refundAddress;
        uint256 dstGasForCall; // TODO: Rename to gasLimit?
        uint256 dstNativeAmount;
    }

    struct LayerZeroParams {
        uint16 dstChainId;
        uint256 amountIn;
        uint256 nativeFee;
        bytes payload;
        address refundAddress;
        uint64 dstGasForCall; // TODO: Rename to gasLimit?
        uint256 dstNativeAmount;
    }

    function swapUsingStargate(IPoolRegistry poolRegistry_, StargateParams memory params_) public {
        IStargateRouter _stargateRouter = poolRegistry_.stargateRouter();
        uint256 _poolId = poolRegistry_.stargatePoolIdOf(params_.tokenIn);
        IStargateRouter.lzTxObj memory _lzTxParams;
        bytes memory _to = abi.encodePacked(IProxyOFT(address(this)).getProxyOFTOf(params_.dstChainId));
        {
            if (_to.toAddress(0) == address(0)) revert AddressIsNull();

            bytes memory _dstNativeAddr = "0x";
            if (params_.dstNativeAmount > 0) {
                _dstNativeAddr = _to;
            }

            _lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: params_.dstGasForCall,
                dstNativeAmount: params_.dstNativeAmount,
                dstNativeAddr: _dstNativeAddr
            });

            IERC20(params_.tokenIn).safeApprove(address(_stargateRouter), 0);
            IERC20(params_.tokenIn).safeApprove(address(_stargateRouter), params_.amountIn);
        }

        _stargateRouter.swap{value: params_.nativeFee}({
            _dstChainId: params_.dstChainId,
            _srcPoolId: _poolId,
            _dstPoolId: _poolId,
            _refundAddress: payable(params_.refundAddress),
            _amountLD: params_.amountIn,
            _minAmountLD: (params_.amountIn * (MAX_BPS - poolRegistry_.stargateSlippage())) / MAX_BPS,
            _lzTxParams: _lzTxParams,
            _to: _to,
            _payload: params_.payload
        });
    }

    function sendUsingLayerZero(IPoolRegistry poolRegistry_, LayerZeroParams memory params_) public {
        bytes memory _to = abi.encodePacked(IProxyOFT(address(this)).getProxyOFTOf(params_.dstChainId));
        if (_to.toAddress(0) == address(0)) revert AddressIsNull();

        address _dstNativeAddr = address(0);
        if (params_.dstNativeAmount > 0) {
            _dstNativeAddr = _to.toAddress(0);
        }

        bytes memory _adapterParams = abi.encodePacked(
            LZ_ADAPTER_PARAMS_VERSION,
            uint256(poolRegistry_.lzBaseGasLimit() + params_.dstGasForCall),
            params_.dstNativeAmount,
            _dstNativeAddr
        );

        IProxyOFT(address(this)).sendAndCall{value: params_.nativeFee}({
            _from: address(this),
            _dstChainId: params_.dstChainId,
            _toAddress: _to,
            _amount: params_.amountIn,
            _payload: params_.payload,
            _dstGasForCall: params_.dstGasForCall,
            _refundAddress: payable(params_.refundAddress),
            _zroPaymentAddress: address(0),
            _adapterParams: _adapterParams
        });
    }

    function swap(
        IPoolRegistry poolRegistry_,
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_
    ) public returns (uint256 _amountOut) {
        ISwapper _swapper = poolRegistry_.swapper();

        // 2. Perform swap
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
}
