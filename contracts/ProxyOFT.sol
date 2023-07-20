// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/ComposableOFTCoreUpgradeable.sol";
import "./dependencies/stargate-protocol/interfaces/IStargateReceiver.sol";
import "./interfaces/IProxyOFT.sol";
import "./storage/ProxyOFTStorage.sol";

error AddressIsNull();
error SenderIsNotTheOwner();
error InvalidFromAddress();
error InvalidMsgSender();
error BridgingIsPaused();

/**
 * @title The ProxyOFT abstract contract
 */
abstract contract ProxyOFT is IStargateReceiver, ComposableOFTCoreUpgradeable, ProxyOFTStorageV1 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    uint256 public constant MAX_BPS = 100_00;

    struct LayerZeroParams {
        uint16 dstChainId;
        uint256 amountIn;
        uint256 nativeFee;
        bytes payload;
        address refundAddress;
        uint64 dstGasForCall;
        uint256 dstNativeAmount;
    }

    function _revertIfBridgingIsPaused(IPoolRegistry poolRegistry_) internal view {
        if (!poolRegistry_.isBridgingActive()) revert BridgingIsPaused();
    }

    function __ProxyOFT_init(address _lzEndpoint, ISyntheticToken syntheticToken_) internal onlyInitializing {
        if (address(syntheticToken_) == address(0)) revert AddressIsNull();
        if (address(_lzEndpoint) == address(0)) revert AddressIsNull();
        __ComposableOFTCoreUpgradeable_init(_lzEndpoint);

        syntheticToken = syntheticToken_;
    }

    function circulatingSupply() public view override returns (uint) {
        return syntheticToken.totalSupply();
    }

    function token() public view override returns (address) {
        return address(syntheticToken);
    }

    function _debitFrom(
        address from_,
        uint16 /*dstChainId_*/,
        bytes memory /*toAddress_*/,
        uint _amount
    ) internal override returns (uint256 _sent) {
        if (from_ != _msgSender()) revert SenderIsNotTheOwner();
        _revertIfBridgingIsPaused(syntheticToken.poolRegistry());
        syntheticToken.burn(from_, _amount);
        return _amount;
    }

    function _creditTo(
        uint16 /*srcChainId_*/,
        address toAddress_,
        uint _amount
    ) internal override returns (uint256 _received) {
        syntheticToken.mint(toAddress_, _amount);
        return _amount;
    }

    function getProxyOFTOf(uint16 chainId_) public view returns (address _proxyOFT) {
        return trustedRemoteLookup[chainId_].toAddress(0);
    }

    function _safeApprove(IERC20 tokenIn_, address spender_, uint256 amount_) internal {
        tokenIn_.safeApprove(spender_, 0);
        tokenIn_.safeApprove(spender_, amount_);
    }

    function sendUsingStargate(IPoolRegistry poolRegistry_, address tokenIn_, LayerZeroParams memory params_) internal {
        IStargateRouter _stargateRouter = poolRegistry_.stargateRouter();
        uint256 _poolId = poolRegistry_.stargatePoolIdOf(tokenIn_);
        IStargateRouter.lzTxObj memory _lzTxParams;
        bytes memory _to = abi.encodePacked(getProxyOFTOf(params_.dstChainId));
        {
            if (_to.toAddress(0) == address(0)) revert AddressIsNull();

            bytes memory _dstNativeAddr;
            if (params_.dstNativeAmount > 0) {
                _dstNativeAddr = _to;
            }

            _lzTxParams = IStargateRouter.lzTxObj({
                dstGasForCall: params_.dstGasForCall,
                dstNativeAmount: params_.dstNativeAmount,
                dstNativeAddr: _dstNativeAddr
            });
        }

        _safeApprove(IERC20(tokenIn_), address(_stargateRouter), params_.amountIn);
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

    function sendUsingLayerZero(IPoolRegistry poolRegistry_, LayerZeroParams memory params_) internal {
        bytes memory _to = abi.encodePacked(getProxyOFTOf(params_.dstChainId));
        if (_to.toAddress(0) == address(0)) revert AddressIsNull();

        address _dstNativeAddr;
        if (params_.dstNativeAmount > 0) {
            _dstNativeAddr = _to.toAddress(0);
        }

        bytes memory _adapterParams = abi.encodePacked(
            uint16(2), // LZ_ADAPTER_PARAMS_VERSION
            uint256(poolRegistry_.lzBaseGasLimit() + params_.dstGasForCall),
            params_.dstNativeAmount,
            _dstNativeAddr
        );

        this.sendAndCall{value: params_.nativeFee}({
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
}
