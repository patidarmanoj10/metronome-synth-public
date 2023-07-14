// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/ILayer2ProxyOFT.sol";
import "./interfaces/ISmartFarmingManager.sol";
import "./ProxyOFT.sol";
import "./storage/Layer2ProxyOFTStorage.sol";

error AddressIsNull();

/**
 * @title Layer2ProxyOFT contract
 */
contract Layer2ProxyOFT is ILayer2ProxyOFT, ProxyOFT, Layer2ProxyOFTStorage {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) public initializer {
        __ProxyOFT_init(_lzEndpoint, syntheticToken_);
        // TODO: Commenting for now because HH doesn't support runtime chainId changing
        // Refs: https://github.com/NomicFoundation/hardhat/issues/3074
        // if (block.chainid == 1) revert NotAvailableOnThisChain();

        lzMainnetChainId = 101;
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
        bytes memory _mainnetOFT = abi.encodePacked(getProxyOFTOf(lzMainnetChainId));

        (uint256 _callbackTxNativeFee, uint64 _swapTxGasLimit_) = abi.decode(lzArgs_, (uint256, uint64));

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
                dstGasForCall: _swapTxGasLimit_,
                dstNativeAmount: _callbackTxNativeFee,
                dstNativeAddr: _mainnetOFT
            })
        });
    }

    function quoteTriggerLeverageSwapNativeFee(
        bytes calldata lzArgs_
    ) public view override returns (uint256 _nativeFee) {
        address _mainnetOFT = getProxyOFTOf(lzMainnetChainId);
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
                uint256(lzBaseGasLimit + _swapTxGasLimit),
                _callbackTxNativeFee,
                _mainnetOFT
            );
        }

        (uint256 _swapTxNativeFee, ) = this.estimateSendAndCallFee({
            _dstChainId: lzMainnetChainId,
            _toAddress: abi.encodePacked(_mainnetOFT),
            _amount: type(uint256).max,
            _payload: _payload,
            _dstGasForCall: _swapTxGasLimit,
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
    ) external payable override onlyIfSmartFarmingManager {
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
            _mainnetOFT = abi.encodePacked(getProxyOFTOf(lzMainnetChainId));
            if (_mainnetOFT.toAddress(0) == address(0)) revert AddressIsNull();

            (uint256 callbackTxNativeFee_, uint64 flashRepaySwapTxGasLimit_) = abi.decode(lzArgs_, (uint256, uint64));

            _lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: flashRepaySwapTxGasLimit_,
                dstNativeAmount: callbackTxNativeFee_,
                dstNativeAddr: _mainnetOFT
            });
        }

        // Note: Tokens share the same id across chains
        uint256 _poolId = poolIdOf[tokenIn_];

        IERC20(tokenIn_).safeApprove(address(_stargateRouter), 0);
        IERC20(tokenIn_).safeApprove(address(_stargateRouter), _amountIn);
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
    ) external payable override onlyIfSmartFarmingManager {
        address payable _refundAddress = account_; // Stack too deep

        address _mainnetOFT = getProxyOFTOf(lzMainnetChainId);
        if (_mainnetOFT == address(0)) revert AddressIsNull();

        bytes memory _payload;
        bytes memory _adapterParams;
        uint64 _leverageSwapTxGasLimit;
        {
            // Note: The amount isn't needed here because it's part of the message
            _payload = abi.encode(msg.sender, requestId_, poolIdOf[tokenOut_], account_, amountOutMin_);

            uint256 _callbackTxNativeFee;
            (_callbackTxNativeFee, _leverageSwapTxGasLimit) = abi.decode(lzArgs_, (uint256, uint64));

            _adapterParams = abi.encodePacked(
                LZ_ADAPTER_PARAMS_VERSION,
                uint256(lzBaseGasLimit + _leverageSwapTxGasLimit),
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
            _dstGasForCall: _leverageSwapTxGasLimit,
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
        if (srcChainId_ != lzMainnetChainId) revert InvalidSourceChain();
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
        if (msg.sender != address(stargateRouter)) revert InvalidMsgSender();
        if (srcChainId_ != lzMainnetChainId) revert InvalidSourceChain();
        if (abi.decode(srcAddress_, (address)) != getProxyOFTOf(srcChainId_)) revert InvalidFromAddress();

        (address _smartFarmingManager, uint256 _layer2LeverageId) = abi.decode(payload_, (address, uint256));

        IERC20(token_).safeApprove(_smartFarmingManager, 0);
        IERC20(token_).safeApprove(_smartFarmingManager, amountLD_);
        ISmartFarmingManager(_smartFarmingManager).layer2LeverageCallback(_layer2LeverageId, amountLD_);
    }
}
