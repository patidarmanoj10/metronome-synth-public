// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILayer2ProxyOFT.sol";
import "./interfaces/ISmartFarmingManager.sol";
import "./ProxyOFT.sol";
import "./storage/Layer2ProxyOFTStorage.sol";
import "./interfaces/IPool.sol";

error InvalidSourceChain();

/**
 * @title Layer2ProxyOFT contract
 */
contract Layer2ProxyOFT is ILayer2ProxyOFT, ProxyOFT, Layer2ProxyOFTStorage {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using BytesLib for bytes;
    using SmartFarming for IPoolRegistry;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) public initializer {
        __ProxyOFT_init(_lzEndpoint, syntheticToken_);
    }

    modifier onlyIfSmartFarmingManager() {
        IPool _pool = IManageable(msg.sender).pool();
        if (!syntheticToken.poolRegistry().isPoolRegistered(address(_pool))) revert InvalidMsgSender();
        if (msg.sender != address(_pool.smartFarmingManager())) revert InvalidMsgSender();
        _;
    }

    /**
     * @notice Get the LZ (native) fee for the `triggerFlashRepay()` call
     * @param lzArgs_ The LZ args for L1 transaction
     * @return _nativeFee The fee in native coin
     */
    function quoteTriggerFlashRepaySwapNativeFee(bytes calldata lzArgs_) external view returns (uint256 _nativeFee) {
        return syntheticToken.poolRegistry().quoteTriggerFlashRepaySwapNativeFee(lzArgs_);
    }

    function quoteTriggerLeverageSwapNativeFee(
        bytes calldata lzArgs_
    ) public view override returns (uint256 _nativeFee) {
        return syntheticToken.poolRegistry().quoteTriggerLeverageSwapNativeFee(lzArgs_);
    }

    function triggerFlashRepaySwap(
        uint256 requestId_,
        address payable account_,
        address tokenIn_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable override onlyIfSmartFarmingManager {
        // Note: The amount isn't needed here because it's part of the message
        bytes memory _payload = abi.encode(msg.sender, requestId_, account_, amountOutMin_);

        (uint256 callbackTxNativeFee_, uint64 flashRepaySwapTxGasLimit_) = abi.decode(lzArgs_, (uint256, uint64));

        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();
        _poolRegistry.swapUsingStargate(
            SmartFarming.StargateParams({
                tokenIn: tokenIn_,
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

    function triggerLeverageSwap(
        uint256 requestId_,
        address payable account_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        bytes calldata lzArgs_
    ) external payable override onlyIfSmartFarmingManager {
        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();

        bytes memory _payload = abi.encode(
            msg.sender,
            requestId_,
            _poolRegistry.stargatePoolIdOf(tokenOut_),
            account_,
            amountOutMin_
        );

        (uint256 _callbackTxNativeFee, uint64 _leverageSwapTxGasLimit) = abi.decode(lzArgs_, (uint256, uint64));

        _poolRegistry.sendUsingLayerZero(
            SmartFarming.LayerZeroParams({
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
        if (msg.sender != address(syntheticToken.poolRegistry().stargateRouter())) revert InvalidMsgSender();
        if (srcChainId_ != syntheticToken.poolRegistry().lzMainnetChainId()) revert InvalidSourceChain();
        if (abi.decode(srcAddress_, (address)) != getProxyOFTOf(srcChainId_)) revert InvalidFromAddress();

        (address _smartFarmingManager, uint256 _layer2LeverageId) = abi.decode(payload_, (address, uint256));

        IERC20(token_).safeApprove(_smartFarmingManager, 0);
        IERC20(token_).safeApprove(_smartFarmingManager, amountLD_);
        ISmartFarmingManager(_smartFarmingManager).layer2LeverageCallback(_layer2LeverageId, amountLD_);
    }
}
