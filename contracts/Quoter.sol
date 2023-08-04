// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import "./dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import "./storage/QuoterStorage.sol";
import "./interfaces/external/IStargateBridge.sol";
import "./lib/CrossChainLib.sol";

error NotAvailableOnThisChain();

/**
 * @title Quoter contract
 */
contract Quoter is Initializable, QuoterStorageV1 {
    using BytesLib for bytes;

    /**
     * @dev LayerZero adapter param version
     * See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
     */
    uint16 public constant LZ_ADAPTER_PARAMS_VERSION = 2;

    /**
     * @dev Stargate swap function type
     * See more: https://stargateprotocol.gitbook.io/stargate/developers/function-types
     */
    uint8 public constant SG_TYPE_SWAP_REMOTE = 1;

    /**
     * @dev OFT packet type
     */
    uint16 public constant PT_SEND_AND_CALL = 1;

    function initialize(IPoolRegistry poolRegistry_) external initializer {
        poolRegistry = poolRegistry_;
    }

    function crossChainDispatcher() private view returns (ICrossChainDispatcher) {
        return poolRegistry.crossChainDispatcher();
    }

    function getLeverageSwapAndCallbackLzArgs(
        uint16 positionChainId_,
        uint16 liquidityChainId_
    ) external view returns (bytes memory _lzArgs) {
        return
            CrossChainLib.encodeLzArgs({
                dstChainId_: liquidityChainId_,
                callbackNativeFee_: quoteLeverageCallbackNativeFee(positionChainId_),
                swapTxGasLimit_: crossChainDispatcher().leverageSwapTxGasLimit()
            });
    }

    function getFlashRepaySwapAndCallbackLzArgs(
        uint16 positionChainId_,
        uint16 liquidityChainId_
    ) external view returns (bytes memory _lzArgs) {
        return
            CrossChainLib.encodeLzArgs({
                dstChainId_: liquidityChainId_,
                callbackNativeFee_: quoteFlashRepayCallbackNativeFee(positionChainId_),
                swapTxGasLimit_: crossChainDispatcher().flashRepaySwapTxGasLimit()
            });
    }

    function quoteLeverageCallbackNativeFee(uint16 dstChainId_) public view returns (uint256 _callbackTxNativeFee) {
        ICrossChainDispatcher _crossChainDispatcher = crossChainDispatcher();
        (_callbackTxNativeFee, ) = _crossChainDispatcher.stargateRouter().quoteLayerZeroFee({
            _dstChainId: dstChainId_,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: abi.encodePacked(address(type(uint160).max)),
            _transferAndCallPayload: CrossChainLib.encodeLeverageCallbackPayload(
                address(type(uint160).max),
                type(uint256).max
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: _crossChainDispatcher.leverageCallbackTxGasLimit(),
                dstNativeAmount: 0,
                dstNativeAddr: ""
            })
        });
    }

    function quoteFlashRepayCallbackNativeFee(uint16 dstChainId_) public view returns (uint256 _callbackTxNativeFee) {
        ICrossChainDispatcher _crossChainDispatcher = crossChainDispatcher();
        uint64 _callbackTxGasLimit = _crossChainDispatcher.flashRepayCallbackTxGasLimit();

        bytes memory _lzPayload = abi.encode(
            PT_SEND_AND_CALL,
            abi.encodePacked(msg.sender),
            abi.encodePacked(address(type(uint160).max)),
            type(uint256).max,
            CrossChainLib.encodeFlashRepayCallbackPayload(
                address(type(uint160).max),
                address(type(uint160).max),
                type(uint256).max
            ),
            _callbackTxGasLimit
        );

        (_callbackTxNativeFee, ) = IStargateBridge(_crossChainDispatcher.stargateRouter().bridge())
            .layerZeroEndpoint()
            .estimateFees(
                dstChainId_,
                address(this),
                _lzPayload,
                false,
                abi.encodePacked(
                    LZ_ADAPTER_PARAMS_VERSION,
                    uint256(_crossChainDispatcher.lzBaseGasLimit() + _callbackTxGasLimit),
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
    function quoteCrossChainFlashRepayNativeFee(
        IProxyOFT proxyOFT,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        (uint16 _dstChainId, uint256 _callbackTxNativeFee, uint64 _swapTxGasLimit_) = CrossChainLib.decodeLzArgs(
            lzArgs_
        );

        bytes memory _destinationProxyOFT = abi.encodePacked(proxyOFT.getProxyOFTOf(_dstChainId));

        (_nativeFee, ) = crossChainDispatcher().stargateRouter().quoteLayerZeroFee({
            _dstChainId: _dstChainId,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: _destinationProxyOFT,
            _transferAndCallPayload: CrossChainLib.encodeFlashRepaySwapPayload(
                address(type(uint160).max),
                address(type(uint160).max),
                type(uint256).max,
                address(type(uint160).max),
                type(uint256).max
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: _swapTxGasLimit_,
                dstNativeAmount: _callbackTxNativeFee,
                dstNativeAddr: _destinationProxyOFT
            })
        });
    }

    function quoteCrossChainLeverageNativeFee(
        IProxyOFT proxyOFT_,
        bytes calldata lzArgs_
    ) public view returns (uint256 _nativeFee) {
        uint16 _dstChainId;
        address _destinationProxyOFT;
        bytes memory _payload;
        bytes memory _adapterParams;
        uint64 _swapTxGasLimit;

        {
            _payload = CrossChainLib.encodeLeverageSwapPayload(
                address(type(uint160).max),
                address(type(uint160).max),
                type(uint256).max,
                type(uint256).max,
                address(type(uint160).max),
                type(uint256).max
            );

            uint256 _callbackTxNativeFee;
            (_dstChainId, _callbackTxNativeFee, _swapTxGasLimit) = CrossChainLib.decodeLzArgs(lzArgs_);

            _destinationProxyOFT = proxyOFT_.getProxyOFTOf(_dstChainId);

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(crossChainDispatcher().lzBaseGasLimit() + _swapTxGasLimit),
                _callbackTxNativeFee,
                _destinationProxyOFT
            );
        }

        (_nativeFee, ) = proxyOFT_.estimateSendAndCallFee({
            _dstChainId: _dstChainId,
            _toAddress: abi.encodePacked(_destinationProxyOFT),
            _amount: type(uint256).max,
            _payload: _payload,
            _dstGasForCall: _swapTxGasLimit,
            _useZro: false,
            _adapterParams: _adapterParams
        });
    }
}
