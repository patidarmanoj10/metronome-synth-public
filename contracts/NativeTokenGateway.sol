// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Address} from "./dependencies/openzeppelin/utils/Address.sol";
import {SafeERC20} from "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {SynthContext} from "./utils/SynthContext.sol";
import {ReentrancyGuardTransient} from "./utils/ReentrancyGuardTransient.sol";
import {TokenHolder} from "./utils/TokenHolder.sol";
import {IWETH} from "./interfaces/external/IWETH.sol";
import {INativeTokenGateway} from "./interfaces/INativeTokenGateway.sol";
import {IDepositToken} from "./interfaces/IDepositToken.sol";
import {IPoolRegistry} from "./interfaces/IPoolRegistry.sol";
import {IPool} from "./interfaces/IPool.sol";

error SenderIsNotGovernor();
error SenderIsNotNativeToken();
error UnregisteredPool();

/**
 * @title Helper contract to easily support native tokens (e.g. ETH/AVAX) as collateral
 */
contract NativeTokenGateway is SynthContext, ReentrancyGuardTransient, TokenHolder, INativeTokenGateway {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using SafeERC20 for IDepositToken;

    IPoolRegistry internal immutable _poolRegistry;
    IWETH public immutable nativeToken;

    modifier onlyGovernor() {
        if (_poolRegistry.governor() != _msgSender()) revert SenderIsNotGovernor();
        _;
    }

    constructor(IPoolRegistry poolRegistry_, IWETH nativeToken_) {
        _poolRegistry = poolRegistry_;
        nativeToken = nativeToken_;
    }

    /**
     * @notice deposits NATIVE_TOKEN as collateral using native. A corresponding amount of the deposit token is minted.
     * @param pool_ The Pool contract
     */
    function deposit(IPool pool_) external payable override {
        if (!_poolRegistry.isPoolRegistered(address(pool_))) revert UnregisteredPool();

        nativeToken.deposit{value: msg.value}();
        IDepositToken _depositToken = pool_.depositTokenOf(nativeToken);
        nativeToken.safeApprove(address(_depositToken), 0);
        nativeToken.safeApprove(address(_depositToken), msg.value);
        _depositToken.deposit(msg.value, _msgSender());
    }

    /**
     * @notice withdraws the NATIVE_TOKEN deposit of _msgSender().
     * @param pool_ The Pool contract
     * @param amount_ The amount of deposit tokens to withdraw and receive native ETH
     */
    function withdraw(IPool pool_, uint256 amount_) external override nonReentrant {
        if (!_poolRegistry.isPoolRegistered(address(pool_))) revert UnregisteredPool();

        address _msgSender = _msgSender();
        IDepositToken _depositToken = pool_.depositTokenOf(nativeToken);
        _depositToken.safeTransferFrom(_msgSender, address(this), amount_);
        (uint256 _withdrawn, ) = _depositToken.withdraw(amount_, address(this));
        nativeToken.withdraw(_withdrawn);
        Address.sendValue(payable(_msgSender), _withdrawn);
    }

    /// @inheritdoc SynthContext
    function poolRegistry() public view override returns (IPoolRegistry) {
        return _poolRegistry;
    }

    /// @inheritdoc TokenHolder
    // solhint-disable-next-line no-empty-blocks
    function _requireCanSweep() internal view override onlyGovernor {}

    /**
     * @dev Only `nativeToken` contract is allowed to transfer to here. Prevent other addresses to send coins to this contract.
     */
    receive() external payable override {
        if (_msgSender() != address(nativeToken)) revert SenderIsNotNativeToken();
    }
}
