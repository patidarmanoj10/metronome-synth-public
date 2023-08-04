// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/ComposableOFTCoreUpgradeable.sol";
import "./interfaces/IProxyOFT.sol";
import "./storage/ProxyOFTStorage.sol";
import "./lib/CrossChainLib.sol";

error AddressIsNull();
error SenderIsNotTheOwner();
error BridgingIsPaused();
error SenderIsNotCrossChainDispatcher();

/**
 * @title The ProxyOFT contract
 */
contract ProxyOFT is ComposableOFTCoreUpgradeable, ProxyOFTStorageV1 {
    using BytesLib for bytes;

    function initialize(address _lzEndpoint, ISyntheticToken syntheticToken_) external initializer {
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
        if (!syntheticToken.poolRegistry().crossChainDispatcher().isBridgingActive()) revert BridgingIsPaused();
        if (_msgSender() != from_) revert SenderIsNotTheOwner();
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

    function sendAndCall(
        address _from,
        uint16 _dstChainId,
        bytes calldata _toAddress,
        uint _amount,
        bytes calldata _payload,
        uint64 _dstGasForCall,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes calldata _adapterParams
    ) public payable override(ComposableOFTCoreUpgradeable, IComposableOFTCoreUpgradeable) {
        if (msg.sender != address(syntheticToken.poolRegistry().crossChainDispatcher()))
            revert SenderIsNotCrossChainDispatcher();

        _sendAndCall(
            _from,
            _dstChainId,
            _toAddress,
            _amount,
            _payload,
            _dstGasForCall,
            _refundAddress,
            _zroPaymentAddress,
            _adapterParams
        );
    }
}
