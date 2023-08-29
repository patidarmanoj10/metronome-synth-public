// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/ComposableOFTCoreUpgradeable.sol";
import "./storage/ProxyOFTStorage.sol";

error AddressIsNull();
error SenderIsNotTheOwner();
error BridgingIsPaused();
error SenderIsNotCrossChainDispatcher();

/**
 * @title The ProxyOFT contract
 */
contract ProxyOFT is ComposableOFTCoreUpgradeable, ProxyOFTStorageV1 {
    using BytesLib for bytes;

    constructor() {
        _disableInitializers();
    }

    function initialize(address lzEndpoint_, ISyntheticToken syntheticToken_) external initializer {
        if (address(syntheticToken_) == address(0)) revert AddressIsNull();
        if (address(lzEndpoint_) == address(0)) revert AddressIsNull();

        __ComposableOFTCoreUpgradeable_init(lzEndpoint_);

        syntheticToken = syntheticToken_;
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
        uint16 /*dstChainId_*/,
        bytes memory /*toAddress_*/,
        uint amount_
    ) internal override returns (uint256 _sent) {
        if (!syntheticToken.poolRegistry().crossChainDispatcher().isBridgingActive()) revert BridgingIsPaused();
        if (msg.sender != from_) revert SenderIsNotTheOwner();
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
        address from_,
        uint16 dstChainId_,
        bytes calldata toAddress_,
        uint amount_,
        bytes calldata payload_,
        uint64 dstGasForCall_,
        address payable refundAddress_,
        address zroPaymentAddress_,
        bytes calldata adapterParams_
    ) public payable override(ComposableOFTCoreUpgradeable, IComposableOFTCoreUpgradeable) {
        if (msg.sender != address(syntheticToken.poolRegistry().crossChainDispatcher()))
            revert SenderIsNotCrossChainDispatcher();

        _sendAndCall(
            from_,
            dstChainId_,
            toAddress_,
            amount_,
            payload_,
            dstGasForCall_,
            refundAddress_,
            zroPaymentAddress_,
            adapterParams_
        );
    }

    function owner() public view override returns (address) {
        return syntheticToken.poolRegistry().governor();
    }
}
