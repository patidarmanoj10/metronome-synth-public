// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {SafeERC20} from "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {SynthContext} from "./utils/SynthContext.sol";
import {ReentrancyGuardTransient} from "./utils/ReentrancyGuardTransient.sol";
import {TokenHolder} from "./utils/TokenHolder.sol";
import {IVPool} from "./interfaces/external/IVPool.sol";
import {IPoolRegistry} from "./interfaces/IPoolRegistry.sol";
import {IVesperGateway} from "./interfaces/IVesperGateway.sol";
import {IDepositToken} from "./interfaces/IDepositToken.sol";
import {IPool} from "./interfaces/IPool.sol";

error SenderIsNotGovernor();
error UnregisteredPool();

/**
 * @title Helper contract to easily support vTokens as collateral
 */
contract VesperGateway is SynthContext, ReentrancyGuardTransient, TokenHolder, IVesperGateway {
    using SafeERC20 for IERC20;
    using SafeERC20 for IDepositToken;
    using SafeERC20 for IVPool;

    IPoolRegistry internal immutable _poolRegistry;

    modifier onlyGovernor() {
        if (_poolRegistry.governor() != _msgSender()) revert SenderIsNotGovernor();
        _;
    }

    constructor(IPoolRegistry poolRegistry_) {
        _poolRegistry = poolRegistry_;
    }

    /**
     * @notice Deposit `vToken` as collateral using underlying asset.
     * @param pool_ The Pool contract
     * @param vToken_ The vToken to deposit
     * @param amount_ The amount of `underlying` asset to deposit
     */
    function deposit(IPool pool_, IVPool vToken_, uint256 amount_) external override {
        if (!_poolRegistry.isPoolRegistered(address(pool_))) revert UnregisteredPool();

        address _msgSender = _msgSender();

        // 1. Get `underlying` asset
        IERC20 _underlying = IERC20(vToken_.token());
        _underlying.safeTransferFrom(_msgSender, address(this), amount_);

        // 2. Deposit `underlying` to `VPool`
        _underlying.safeApprove(address(vToken_), 0);
        _underlying.safeApprove(address(vToken_), amount_);
        uint256 _balanceBefore = vToken_.balanceOf(address(this));
        vToken_.deposit(amount_);
        uint256 _vTokenAmount = vToken_.balanceOf(address(this)) - _balanceBefore;

        // 3. Deposit `VPool` to `Synth` and send `msdTokens` to the `_msgSender()`
        IDepositToken _depositToken = pool_.depositTokenOf(vToken_);
        vToken_.safeApprove(address(_depositToken), 0);
        vToken_.safeApprove(address(_depositToken), _vTokenAmount);
        _depositToken.deposit(_vTokenAmount, _msgSender);
    }

    /**
     * @notice Withdraws the `vToken` deposit of _msgSender().
     * @param pool_ The Pool contract
     * @param vToken_ The vToken to withdraw
     * @param amount_ The amount of deposit tokens to withdraw and receive underlying
     */
    function withdraw(IPool pool_, IVPool vToken_, uint256 amount_) external override nonReentrant {
        if (!_poolRegistry.isPoolRegistered(address(pool_))) revert UnregisteredPool();

        address _msgSender = _msgSender();

        // 1. Get `msdTokens`
        IDepositToken _depositToken = pool_.depositTokenOf(vToken_);
        _depositToken.safeTransferFrom(_msgSender, address(this), amount_);

        // 2. Withdraw `vTokens` from `Synth`
        (uint256 _vTokenAmount, ) = _depositToken.withdraw(amount_, address(this));

        // 3. Withdraw `underlying` from `VPool`
        IERC20 _underlying = IERC20(vToken_.token());
        uint256 _balanceBefore = _underlying.balanceOf(address(this));
        vToken_.withdraw(_vTokenAmount);
        uint256 _underlyingAmount = _underlying.balanceOf(address(this)) - _balanceBefore;

        // 4. Transfer `underlying` to the `_msgSender()`
        _underlying.safeTransfer(_msgSender, _underlyingAmount);
    }

    /// @inheritdoc SynthContext
    function poolRegistry() public view override returns (IPoolRegistry) {
        return _poolRegistry;
    }

    /// @inheritdoc TokenHolder
    // solhint-disable-next-line no-empty-blocks
    function _requireCanSweep() internal view override onlyGovernor {}
}
