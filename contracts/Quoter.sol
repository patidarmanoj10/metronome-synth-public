// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import "./dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import "./storage/QuoterStorage.sol";
import "./interfaces/external/IStargateBridge.sol";

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

    function getLeverageSwapAndCallbackLzArgs(uint16 dstChainId_) external view returns (bytes memory _lzArgs) {
        return abi.encode(quoteLeverageCallbackNativeFee(dstChainId_), poolRegistry.leverageSwapTxGasLimit());
    }

    function getFlashRepaySwapAndCallbackLzArgs(uint16 dstChainId_) external view returns (bytes memory _lzArgs) {
        return abi.encode(quoteFlashRepayCallbackNativeFee(dstChainId_), poolRegistry.flashRepaySwapTxGasLimit());
    }

    function quoteLeverageCallbackNativeFee(uint16 dstChainId_) public view returns (uint256 _callbackTxNativeFee) {
        if (_chainId() != 1) revert NotAvailableOnThisChain();

        IPoolRegistry _poolRegistry = poolRegistry;
        (_callbackTxNativeFee, ) = _poolRegistry.stargateRouter().quoteLayerZeroFee({
            _dstChainId: dstChainId_,
            _functionType: SG_TYPE_SWAP_REMOTE,
            _toAddress: abi.encodePacked(address(type(uint160).max)),
            _transferAndCallPayload: abi.encodePacked(
                address(type(uint160).max), // smart farming manager
                bytes32(type(uint256).max) // requestId
            ),
            _lzTxParams: IStargateRouter.lzTxObj({
                dstGasForCall: _poolRegistry.leverageCallbackTxGasLimit(),
                dstNativeAmount: 0,
                dstNativeAddr: ""
            })
        });
    }

    function quoteFlashRepayCallbackNativeFee(uint16 dstChainId_) public view returns (uint256 _callbackTxNativeFee) {
        if (_chainId() != 1) revert NotAvailableOnThisChain();

        IPoolRegistry _poolRegistry = poolRegistry;
        uint64 _callbackTxGasLimit = _poolRegistry.flashRepayCallbackTxGasLimit();

        bytes memory _lzPayload = abi.encode(
            PT_SEND_AND_CALL,
            abi.encodePacked(msg.sender),
            abi.encodePacked(address(type(uint160).max)),
            type(uint256).max,
            abi.encode(
                address(type(uint160).max), // smart farming manager
                bytes32(type(uint256).max) // requestId
            ),
            _callbackTxGasLimit
        );

        (_callbackTxNativeFee, ) = IStargateBridge(_poolRegistry.stargateRouter().bridge())
            .layerZeroEndpoint()
            .estimateFees(
                dstChainId_,
                address(this),
                _lzPayload,
                false,
                abi.encodePacked(
                    LZ_ADAPTER_PARAMS_VERSION,
                    uint256(_poolRegistry.lzBaseGasLimit() + _callbackTxGasLimit),
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
    function quoteLayer2FlashRepayNativeFee(
        IProxyOFT proxyOFT,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        IPoolRegistry _poolRegistry = poolRegistry;
        uint16 _lzMainnetChainId = _poolRegistry.lzMainnetChainId();
        bytes memory _mainnetOFT = abi.encodePacked(proxyOFT.getProxyOFTOf(_lzMainnetChainId));

        (uint256 _callbackTxNativeFee, uint64 _swapTxGasLimit_) = abi.decode(lzArgs_, (uint256, uint64));

        (_nativeFee, ) = _poolRegistry.stargateRouter().quoteLayerZeroFee({
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

    function quoteLayer2LeverageNativeFee(
        IProxyOFT proxyOFT_,
        bytes calldata lzArgs_
    ) public view returns (uint256 _nativeFee) {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        IPoolRegistry _poolRegistry = poolRegistry;
        uint16 _lzMainnetChainId = _poolRegistry.lzMainnetChainId();
        address _mainnetOFT = proxyOFT_.getProxyOFTOf(_lzMainnetChainId);
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
                uint256(_poolRegistry.lzBaseGasLimit() + _swapTxGasLimit),
                _callbackTxNativeFee,
                _mainnetOFT
            );
        }

        (_nativeFee, ) = proxyOFT_.estimateSendAndCallFee({
            _dstChainId: _lzMainnetChainId,
            _toAddress: abi.encodePacked(_mainnetOFT),
            _amount: type(uint256).max,
            _payload: _payload,
            _dstGasForCall: _swapTxGasLimit,
            _useZro: false,
            _adapterParams: _adapterParams
        });
    }

    /**
     * @dev Encapsulates chainId call for better tests fit
     * Refs: https://github.com/NomicFoundation/hardhat/issues/3074
     */
    function _chainId() internal view virtual returns (uint256) {
        return block.chainid;
    }
}
