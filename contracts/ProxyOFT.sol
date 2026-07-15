// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {ContextUpgradeable} from "./dependencies/openzeppelin-upgradeable/utils/ContextUpgradeable.sol";
import {OwnableUpgradeable} from "./dependencies/openzeppelin-upgradeable/access/OwnableUpgradeable.sol";
import {IOFTCoreUpgradeable, IComposableOFTCoreUpgradeable, OFTCoreUpgradeable, ComposableOFTCoreUpgradeable} from "./dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/ComposableOFTCoreUpgradeable.sol";
import {BytesLib} from "./dependencies/@layerzerolabs/solidity-examples/util/BytesLib.sol";
import {Context, SynthContext} from "./utils/SynthContext.sol";
import {ProxyOFTStorageV1} from "./storage/ProxyOFTStorage.sol";
import {IPoolRegistry} from "./interfaces/IPoolRegistry.sol";
import {ISyntheticToken} from "./interfaces/ISyntheticToken.sol";

error AddressIsNull();
error SenderIsNotTheOwner();
error BridgingIsPaused();
error SendAndCallNotAllowed();
error DestinationChainNotAllowed();

/**
 * @title The ProxyOFT contract
 */
contract ProxyOFT is SynthContext, ComposableOFTCoreUpgradeable, ProxyOFTStorageV1 {
    using BytesLib for bytes;

    string public constant VERSION = "1.3.2";

    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc Context
    function _msgSender() internal view virtual override(ContextUpgradeable, SynthContext) returns (address) {
        return SynthContext._msgSender();
    }

    /// @inheritdoc Context
    function _msgData() internal view virtual override(ContextUpgradeable, Context) returns (bytes calldata) {
        return Context._msgData();
    }

    function initialize(address lzEndpoint_, ISyntheticToken syntheticToken_) external initializer {
        if (address(syntheticToken_) == address(0)) revert AddressIsNull();
        if (address(lzEndpoint_) == address(0)) revert AddressIsNull();

        syntheticToken = syntheticToken_;

        __ComposableOFTCoreUpgradeable_init(lzEndpoint_);
    }

    /// @inheritdoc IOFTCoreUpgradeable
    function circulatingSupply() public view override returns (uint) {
        return syntheticToken.totalSupply();
    }

    /**
     * @notice Get other chains Proxy OFT contracts
     * @param chainId_ the chain to get contract from
     */
    function getProxyOFTOf(uint16 chainId_) public view returns (address _proxyOFT) {
        return trustedRemoteLookup[chainId_].toAddress(0);
    }

    /// @inheritdoc IOFTCoreUpgradeable
    function token() public view override returns (address) {
        return address(syntheticToken);
    }

    /// @inheritdoc OFTCoreUpgradeable
    function _debitFrom(
        address from_,
        uint16 dstChainId_,
        bytes memory /*toAddress_*/,
        uint amount_
    ) internal override returns (uint256 _sent) {
        IPoolRegistry _poolRegistry = syntheticToken.poolRegistry();
        if (_msgSender() != from_) revert SenderIsNotTheOwner();
        if (!_poolRegistry.isBridgingActive()) revert BridgingIsPaused();
        if (!_poolRegistry.isDestinationChainSupported(dstChainId_)) revert DestinationChainNotAllowed();

        syntheticToken.burn(from_, amount_);
        return amount_;
    }

    /// @inheritdoc OFTCoreUpgradeable
    function _creditTo(
        uint16 /*srcChainId_*/,
        address toAddress_,
        uint amount_
    ) internal override returns (uint256 _received) {
        syntheticToken.mint(toAddress_, amount_);
        return amount_;
    }

    /// @inheritdoc ComposableOFTCoreUpgradeable
    function sendAndCall(
        address /*from_*/,
        uint16 /*dstChainId_*/,
        bytes calldata /*toAddress_*/,
        uint /*amount_*/,
        bytes calldata /*payload_*/,
        uint64 /*dstGasForCall_*/,
        address payable /*refundAddress_*/,
        address /*zroPaymentAddress_*/,
        bytes calldata /*adapterParams_*/
    ) public payable override(ComposableOFTCoreUpgradeable, IComposableOFTCoreUpgradeable) {
        // Note: We do not allow sendAndCall functionality in the ProxyOFT
        // Replace the revert with `_sendAndCall` call to enable.
        revert SendAndCallNotAllowed();
    }

    /**
     * @notice User friendly `sendFrom()` function
     */
    function sendFrom(address from_, uint16 dstChainId_, address to_, uint256 amount_) external payable {
        _send({
            _from: from_,
            _dstChainId: dstChainId_,
            _toAddress: abi.encodePacked(to_),
            _amount: amount_,
            _refundAddress: payable(from_),
            _zroPaymentAddress: address(0),
            _adapterParams: abi.encodePacked(
                uint16(1), // LZ_ADAPTER_PARAMS_VERSION
                syntheticToken.poolRegistry().lzBaseGasLimit()
            )
        });
    }

    /**
     * @notice User friendly `sendFrom()` function
     */
    function estimateSendFee(
        uint16 dstChainId_,
        address to_,
        uint256 amount_
    ) external view returns (uint256 _nativeFee) {
        (_nativeFee, ) = this.estimateSendFee({
            _dstChainId: dstChainId_,
            _toAddress: abi.encodePacked(to_),
            _amount: amount_,
            _useZro: false,
            _adapterParams: abi.encodePacked(
                uint16(1), // LZ_ADAPTER_PARAMS_VERSION
                syntheticToken.poolRegistry().lzBaseGasLimit()
            )
        });
    }

    /// @notice Get pool registry contract
    function poolRegistry() public view override returns (IPoolRegistry) {
        return syntheticToken.poolRegistry();
    }

    /// @inheritdoc OwnableUpgradeable
    function owner() public view override returns (address) {
        return syntheticToken.poolRegistry().governor();
    }

    /// @inheritdoc OwnableUpgradeable
    function renounceOwnership() public override {
        revert("disabled");
    }

    /// @inheritdoc OwnableUpgradeable
    function transferOwnership(address) public override {
        revert("disabled");
    }
}
