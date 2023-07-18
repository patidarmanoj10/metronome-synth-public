// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/ComposableOFTCoreUpgradeable.sol";
import "./dependencies/stargate-protocol/interfaces/IStargateReceiver.sol";
import "./interfaces/IProxyOFT.sol";
import "./storage/ProxyOFTStorage.sol";
import "./lib/SmartFarming.sol";

error SenderIsNotTheOwner();
error InvalidFromAddress();
error InvalidMsgSender();

/**
 * @title The ProxyOFT abstract contract
 */
abstract contract ProxyOFT is IStargateReceiver, ComposableOFTCoreUpgradeable, ProxyOFTStorageV1 {
    using BytesLib for bytes;

    function __ProxyOFT_init(address _lzEndpoint, ISyntheticToken syntheticToken_) internal onlyInitializing {
        if (address(syntheticToken_) == address(0)) revert AddressIsNull();
        if (address(_lzEndpoint) == address(0)) revert AddressIsNull();
        __ComposableOFTCoreUpgradeable_init(_lzEndpoint);

        syntheticToken = syntheticToken_;
    }

    function circulatingSupply() public view virtual override returns (uint) {
        return syntheticToken.totalSupply();
    }

    function token() public view virtual override returns (address) {
        return address(syntheticToken);
    }

    function _debitFrom(
        address from_,
        uint16 /*dstChainId_*/,
        bytes memory /*toAddress_*/,
        uint _amount
    ) internal virtual override returns (uint256 _sent) {
        if (from_ != _msgSender()) revert SenderIsNotTheOwner();
        syntheticToken.burn(from_, _amount);
        return _amount;
    }

    function _creditTo(
        uint16 /*srcChainId_*/,
        address toAddress_,
        uint _amount
    ) internal virtual override returns (uint256 _received) {
        syntheticToken.mint(toAddress_, _amount);
        return _amount;
    }

    function getProxyOFTOf(uint16 chainId_) public view returns (address _proxyOFT) {
        return trustedRemoteLookup[chainId_].toAddress(0);
    }
}
