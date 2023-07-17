// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/@layerzerolabs/solidity-examples/contracts-upgradeable/token/oft/composable/ComposableOFTCoreUpgradeable.sol";
import "./dependencies/stargate-protocol/interfaces/IStargateReceiver.sol";
import "./interfaces/external/IStargateFactory.sol";
import "./interfaces/external/IStargatePool.sol";
import "./interfaces/IProxyOFT.sol";
import "./interfaces/ISyntheticToken.sol";
import "./interfaces/IPool.sol";
import "./lib/WadRayMath.sol";

error SenderIsNotTheOwner();
error NotAvailableOnThisChain();
error InvalidFromAddress();
error InvalidMsgSender();
error InvalidSourceChain();

/**
 * @title The ProxyOFT abstract contract
 */
abstract contract ProxyOFT is IProxyOFT, IStargateReceiver, ComposableOFTCoreUpgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;
    using BytesLib for bytes;

    uint256 public constant MAX_BPS = 100_00;

    // See more: https://layerzero.gitbook.io/docs/evm-guides/advanced/relayer-adapter-parameters
    uint16 public constant LZ_ADAPTER_PARAMS_VERSION = 2;

    // See more: https://stargateprotocol.gitbook.io/stargate/developers/function-types
    uint8 public constant SG_TYPE_SWAP_REMOTE = 1;

    uint256 public lzBaseGasLimit;

    // Note: Can we get this from the sgRouter contract?
    uint256 public stargateSlippage;

    ISyntheticToken internal syntheticToken;

    IStargateRouter public stargateRouter;

    // token => chainId => poolId
    mapping(address => uint256) public poolIdOf;

    function __ProxyOFT_init(address _lzEndpoint, ISyntheticToken syntheticToken_) internal onlyInitializing {
        __ComposableOFTCoreUpgradeable_init(_lzEndpoint);
        __ProxyOFT_init_unchained(syntheticToken_);
    }

    function __ProxyOFT_init_unchained(ISyntheticToken syntheticToken_) internal onlyInitializing {
        syntheticToken = syntheticToken_;
        stargateSlippage = 10; // 0.1%

        // TODO: Should we use `minDstGasLookup[dstChainId][PT_SEND_AND_CALL]` instead?
        lzBaseGasLimit = 200_000;
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

    function _getSgAmountOutMin(uint256 amountIn_) internal view returns (uint256) {
        return (amountIn_ * (MAX_BPS - stargateSlippage)) / MAX_BPS;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    function updateStargateRouter(IStargateRouter stargateRouter_) public {
        stargateRouter = stargateRouter_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    // - comment
    //      Use LZ ids (https://stargateprotocol.gitbook.io/stargate/developers/pool-ids)
    // - rename to updateSgPoolIdOf?
    function updatePoolIdOf(address token_, uint256 poolId_) public {
        poolIdOf[token_] = poolId_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    function updateStargateSlippage(uint256 stargateSlippage_) external {
        stargateSlippage = stargateSlippage_;
    }

    // TODO:
    // - only owner/governor
    // - emit event
    function updateLzBaseGasLimit(uint256 lzBaseGasLimit_) external {
        lzBaseGasLimit = lzBaseGasLimit_;
    }

    receive() external payable {}
}
