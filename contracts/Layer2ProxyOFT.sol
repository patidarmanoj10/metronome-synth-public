// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/ILayer2ProxyOFT.sol";
import "./interfaces/ISmartFarmingManager.sol";
import "./ProxyOFT.sol";
import "./interfaces/IPool.sol";

error InvalidSourceChain();

/**
 * @title Layer2ProxyOFT contract
 */
contract Layer2ProxyOFT is ILayer2ProxyOFT, ProxyOFT {
    using BytesLib for bytes;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) public initializer {
        __ProxyOFT_init(_lzEndpoint, syntheticToken_);
    }

    function _revertIfNotSmartFarmingManager() private view {
        IPool _pool = IManageable(msg.sender).pool();
        if (!syntheticToken.poolRegistry().isPoolRegistered(address(_pool))) revert InvalidMsgSender();
        if (msg.sender != address(_pool.smartFarmingManager())) revert InvalidMsgSender();
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
        uint256 requestId_,
        address payable account_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable override {
        _revertIfNotSmartFarmingManager();
        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();
        _revertIfBridgingIsPaused(_poolRegistry);

        bytes memory _payload = abi.encode(msg.sender, requestId_, account_, amountOutMin_);

        (uint256 callbackTxNativeFee_, uint64 flashRepaySwapTxGasLimit_) = abi.decode(lzArgs_, (uint256, uint64));

        sendUsingStargate(
            _poolRegistry,
            tokenIn_,
            LayerZeroParams({
                dstChainId: _poolRegistry.lzMainnetChainId(),
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
        uint256 requestId_,
        address payable account_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable override {
        _revertIfNotSmartFarmingManager();

        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();

        bytes memory _payload = abi.encode(
            msg.sender,
            requestId_,
            _poolRegistry.stargatePoolIdOf(tokenOut_),
            account_,
            amountOutMin_
        );

        (uint256 _callbackTxNativeFee, uint64 _leverageSwapTxGasLimit) = abi.decode(lzArgs_, (uint256, uint64));

        sendUsingLayerZero(
            _poolRegistry,
            LayerZeroParams({
                dstChainId: _poolRegistry.lzMainnetChainId(),
                amountIn: amountIn_,
                payload: _payload,
                refundAddress: account_,
                dstGasForCall: _leverageSwapTxGasLimit,
                dstNativeAmount: _callbackTxNativeFee,
                nativeFee: msg.value
            })
        );
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
    ) external override {
        if (msg.sender != address(this)) revert InvalidMsgSender();
        if (srcChainId_ != syntheticToken.poolRegistry().lzMainnetChainId()) revert InvalidSourceChain();
        address _from = from_.toAddress(0);
        if (_from == address(0) || _from != getProxyOFTOf(srcChainId_)) revert InvalidFromAddress();

        (address _smartFarmingManager, uint256 _layer2FlashRepayId) = abi.decode(payload_, (address, uint256));

        IERC20 _syntheticToken = syntheticToken;

        _safeApprove(_syntheticToken, _smartFarmingManager, amount_);
        ISmartFarmingManager(_smartFarmingManager).layer2FlashRepayCallback(_layer2FlashRepayId, amount_);
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
    ) external override {
        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();
        if (msg.sender != address(_poolRegistry.stargateRouter())) revert InvalidMsgSender();
        if (srcChainId_ != _poolRegistry.lzMainnetChainId()) revert InvalidSourceChain();
        if (abi.decode(srcAddress_, (address)) != getProxyOFTOf(srcChainId_)) revert InvalidFromAddress();

        (address _smartFarmingManager, uint256 _layer2LeverageId) = abi.decode(payload_, (address, uint256));

        _safeApprove(IERC20(token_), _smartFarmingManager, amountLD_);
        ISmartFarmingManager(_smartFarmingManager).layer2LeverageCallback(_layer2LeverageId, amountLD_);
    }
}
