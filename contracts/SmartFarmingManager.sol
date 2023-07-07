// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILayer2ProxyOFT.sol";
import "./access/Manageable.sol";
import "./storage/SmartFarmingManagerStorage.sol";
import "./lib/WadRayMath.sol";

error SyntheticDoesNotExist();
error PoolIsNull();
error FlashRepaySlippageTooHigh();
error LeverageTooLow();
error LeverageTooHigh();
error LeverageSlippageTooHigh();
error PositionIsNotHealthy();
error AmountIsZero();
error AmountIsTooHigh();
error DepositTokenDoesNotExist();
error AddressIsNull();
error NewValueIsSameAsCurrent();
error Layer2RequestInvalidKey();
error SenderIsNotProxyOFT();
error NotAvailableOnThisChain();
error Layer2RequestCompletedAlready();
error TokenInIsNull();
error SenderIsNotAccount();

/**
 * @title SmartFarmingManager contract
 */
contract SmartFarmingManager is ReentrancyGuard, Manageable, SmartFarmingManagerV1 {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using MappedEnumerableSet for MappedEnumerableSet.AddressSet;

    string public constant VERSION = "1.2.0";

    // TODO: Comment
    event Layer2LeverageStarted(uint256 indexed id);
    event Layer2LeverageFinished(uint256 indexed id);

    event Layer2FlashRepayStarted(uint256 indexed id);
    event Layer2FlashRepayFinished(uint256 indexed id);

    /// @notice Emitted when swapper contract is updated
    event SwapperUpdated(ISwapper oldSwapFee, ISwapper newSwapFee);

    // TODO: Comment
    modifier onlyIfProxyOFT() {
        ISyntheticToken _syntheticToken = ISyntheticToken(ILayer2ProxyOFT(msg.sender).token());
        if (!pool.doesSyntheticTokenExist(_syntheticToken) || address(_syntheticToken.proxyOFT()) != msg.sender) {
            revert SenderIsNotProxyOFT();
        }
        _;
    }

    modifier onlyIfDepositTokenExists(IDepositToken depositToken_) {
        if (!pool.doesDepositTokenExist(depositToken_)) revert DepositTokenDoesNotExist();
        _;
    }

    modifier onlyIfSyntheticTokenExists(ISyntheticToken syntheticToken_) {
        if (!pool.doesSyntheticTokenExist(syntheticToken_)) revert SyntheticDoesNotExist();
        _;
    }

    function initialize(IPool pool_) public initializer {
        if (address(pool_) == address(0)) revert PoolIsNull();
        __ReentrancyGuard_init();
        __Manageable_init(pool_);
    }

    /**
     * @notice Flash debt repayment
     * @param syntheticToken_ The debt token to repay
     * @param depositToken_ The collateral to withdraw
     * @param withdrawAmount_ The amount to withdraw
     * @param repayAmountMin_ The minimum amount to repay (slippage check)
     */
    function flashRepay(
        ISyntheticToken syntheticToken_,
        IDepositToken depositToken_,
        uint256 withdrawAmount_,
        uint256 repayAmountMin_
    )
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
        returns (uint256 _withdrawn, uint256 _repaid)
    {
        if (block.chainid != 1) revert NotAvailableOnThisChain();
        if (withdrawAmount_ == 0) revert AmountIsZero();
        if (withdrawAmount_ > depositToken_.balanceOf(msg.sender)) revert AmountIsTooHigh();
        IPool _pool = pool;
        IDebtToken _debtToken = _pool.debtTokenOf(syntheticToken_);
        if (repayAmountMin_ > _debtToken.balanceOf(msg.sender)) revert AmountIsTooHigh();

        // 1. withdraw collateral
        (_withdrawn, ) = depositToken_.flashWithdraw(msg.sender, withdrawAmount_);

        // 2. swap for synth
        uint256 _amountToRepay = _swap(swapper, depositToken_.underlying(), syntheticToken_, _withdrawn, 0);

        // 3. repay debt
        (_repaid, ) = _debtToken.repay(msg.sender, _amountToRepay);
        if (_repaid < repayAmountMin_) revert FlashRepaySlippageTooHigh();

        // 4. check the health of the outcome position
        (bool _isHealthy, , , , ) = _pool.debtPositionOf(msg.sender);
        if (!_isHealthy) revert PositionIsNotHealthy();
    }

    // Note: The quotation may change from a block to block, and, since user will call this before
    // broadcasting the actual leverage tx, the tx may fail if fee rises in the meanwhile
    // to avoid that, user may send a bit more (e.g. _nativeFee * 110%) and get refund.
    // TODO: Which is better? Make quote function to return slightly more or let the UI handle this?
    function quoteLayer2FlashRepayNativeFee(
        ISyntheticToken syntheticToken_,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        return
            ILayer2ProxyOFT(address(syntheticToken_.proxyOFT())).quoteTriggerFlashRepaySwapNativeFee({
                lzArgs_: lzArgs_
            });
    }

    // Note: The quotation may change from a block to block, and, since user will call this before
    // broadcasting the actual leverage tx, the tx may fail if fee rises in the meanwhile
    // to avoid that, user may send a bit more (e.g. _nativeFee * 110%) and get refund.
    // TODO: Which is better? Make quote function to return slightly more or let the UI handle this?
    function quoteLayer2LeverageNativeFee(
        ISyntheticToken syntheticToken_,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        return
            ILayer2ProxyOFT(address(syntheticToken_.proxyOFT())).quoteTriggerLeverageSwapNativeFee({lzArgs_: lzArgs_});
    }

    // TODO: Comment
    function _collateralTransferFrom(
        address from_,
        ISwapper swapper_,
        IERC20 tokenIn_,
        IERC20 _collateral,
        uint256 amountIn_
    ) private returns (uint256 _transferredAmount) {
        if (address(tokenIn_) == address(0)) tokenIn_ = _collateral;
        tokenIn_.safeTransferFrom(from_, address(this), amountIn_);
        if (tokenIn_ != _collateral) {
            // Note: `amountOutMin_` is `0` because slippage will be checked later on
            return _swap(swapper_, tokenIn_, _collateral, amountIn_, 0);
        }
        return amountIn_;
    }

    // TODO: Comment
    // TODO: See if fits https://github.com/autonomoussoftware/metronome-synth/issues/798
    function _calculateLeverageDebtAmount(
        IERC20 _collateral,
        ISyntheticToken syntheticToken_,
        uint256 amountIn_,
        uint256 leverage_
    ) private view returns (uint256 _debtAmount) {
        return
            pool.masterOracle().quote(
                address(_collateral),
                address(syntheticToken_),
                (leverage_ - 1e18).wadMul(amountIn_)
            );
    }

    /**
     * @notice Leverage yield position
     * @param tokenIn_ The token to transfer
     * @param depositToken_ The collateral to deposit
     * @param syntheticToken_ The msAsset to mint
     * @param amountIn_ The amount to deposit
     * @param leverage_ The leverage X param (e.g. 1.5e18 for 1.5X)
     * @param depositAmountMin_ The min final deposit amount (slippage)
     */
    function leverage(
        IERC20 tokenIn_,
        IDepositToken depositToken_,
        ISyntheticToken syntheticToken_,
        uint256 amountIn_,
        uint256 leverage_,
        uint256 depositAmountMin_
    )
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
        returns (uint256 _deposited, uint256 _issued)
    {
        if (block.chainid != 1) revert NotAvailableOnThisChain();
        if (amountIn_ == 0) revert AmountIsZero();
        if (leverage_ <= 1e18) revert LeverageTooLow();
        if (leverage_ > uint256(1e18).wadDiv(1e18 - depositToken_.collateralFactor())) revert LeverageTooHigh();

        IPool _pool = pool;
        ISwapper _swapper = swapper;

        // 1. transfer collateral
        IERC20 _collateral = depositToken_.underlying();
        amountIn_ = _collateralTransferFrom(msg.sender, _swapper, tokenIn_, _collateral, amountIn_);

        // 2. mint synth + debt
        uint256 _debtAmount = _calculateLeverageDebtAmount(_collateral, syntheticToken_, amountIn_, leverage_);
        IDebtToken _debtToken = _pool.debtTokenOf(syntheticToken_);
        (_issued, ) = _debtToken.flashIssue(address(this), _debtAmount);
        _debtToken.mint(msg.sender, _debtAmount);

        // 3. swap synth for collateral
        uint256 _depositAmount = amountIn_ + _swap(_swapper, syntheticToken_, _collateral, _issued, 0);
        if (_depositAmount < depositAmountMin_) revert LeverageSlippageTooHigh();

        // 4. deposit collateral
        _collateral.safeApprove(address(depositToken_), 0);
        _collateral.safeApprove(address(depositToken_), _depositAmount);
        (_deposited, ) = depositToken_.deposit(_depositAmount, msg.sender);

        // 5. check the health of the outcome position
        (bool _isHealthy, , , , ) = _pool.debtPositionOf(msg.sender);
        if (!_isHealthy) revert PositionIsNotHealthy();
    }

    // TODO: Comment
    function layer2FlashRepay(
        ISyntheticToken syntheticToken_,
        IDepositToken depositToken_,
        uint256 withdrawAmount_,
        IERC20 underlying_,
        uint256 underlyingAmountMin_, // collateral -> naked
        uint256 layer1SwapAmountOutMin_, // naked -> synth
        uint256 repayAmountMin_,
        bytes calldata lzArgs_
    )
        external
        payable
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
    {
        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (withdrawAmount_ == 0) revert AmountIsZero();
        if (withdrawAmount_ > depositToken_.balanceOf(msg.sender)) revert AmountIsTooHigh();
        IDebtToken _debtToken = pool.debtTokenOf(syntheticToken_);
        if (repayAmountMin_ > _debtToken.balanceOf(msg.sender)) revert AmountIsTooHigh();

        uint256 _amountIn;

        {
            // 1. withdraw collateral
            // Note: Withdraw to `proxyOFT` to save transfer gas
            (uint256 _withdrawn, ) = depositToken_.flashWithdraw(msg.sender, withdrawAmount_);

            // 2. swap collateral for its underlying
            _amountIn = _swap(swapper, depositToken_.underlying(), underlying_, _withdrawn, underlyingAmountMin_);
            // TODO: Make swap send to proxyOFT directly
            underlying_.safeTransfer(address(syntheticToken_.proxyOFT()), _amountIn);
        }

        // 3. store request
        uint256 _id = layer2RequestId++;

        layer2FlashRepays[_id] = Layer2FlashRepay({
            syntheticToken: syntheticToken_,
            depositToken: depositToken_,
            withdrawAmount: withdrawAmount_,
            underlying: underlying_,
            repayAmountMin: repayAmountMin_,
            debtRepaid: 0,
            account: msg.sender,
            finished: false
        });

        // 4. trigger L1  swap
        ILayer2ProxyOFT(address(syntheticToken_.proxyOFT())).triggerFlashRepaySwap{value: msg.value}({
            id_: _id,
            account_: payable(msg.sender),
            tokenIn_: address(underlying_),
            amountIn_: _amountIn,
            amountOutMin_: layer1SwapAmountOutMin_,
            lzArgs_: lzArgs_
        });

        // TODO: Move params from storage to event
        emit Layer2FlashRepayStarted(_id);
    }

    // TODO
    //  - Comment
    function layer2FlashRepayCallback(
        uint256 id_,
        uint256 swapAmountOut_
    ) external override whenNotShutdown nonReentrant onlyIfProxyOFT returns (uint256 _repaid) {
        if (block.chainid == 1) revert NotAvailableOnThisChain();

        IPool _pool = pool;
        Layer2FlashRepay memory _request = layer2FlashRepays[id_];

        if (_request.account == address(0)) revert Layer2RequestInvalidKey();
        if (msg.sender != address(_request.syntheticToken.proxyOFT())) revert SenderIsNotProxyOFT();
        if (_request.finished) revert Layer2RequestCompletedAlready();

        // 1. update state
        layer2FlashRepays[id_].finished = true;

        // 2. transfer synthetic token (swapAmountOut)
        _request.syntheticToken.transferFrom(msg.sender, address(this), swapAmountOut_);

        // 3. repay debt
        (_repaid, ) = _pool.debtTokenOf(_request.syntheticToken).repay(_request.account, swapAmountOut_);
        if (_repaid < _request.repayAmountMin) revert FlashRepaySlippageTooHigh();
        layer2FlashRepays[id_].debtRepaid = _repaid;

        // 4. check the health of the outcome position
        (bool _isHealthy, , , , ) = _pool.debtPositionOf(_request.account);
        if (!_isHealthy) revert PositionIsNotHealthy();

        emit Layer2FlashRepayFinished(id_);
    }

    function layer2Leverage(
        IERC20 underlying_, // e.g. USDC is the vaUSDC's underlying (a.k.a. naked token)
        IDepositToken depositToken_,
        ISyntheticToken syntheticToken_,
        uint256 amountIn_,
        uint256 leverage_,
        uint256 layer1SwapAmountOutMin_, // Set slippage for L1 swap
        uint256 depositAmountMin_,
        bytes calldata lzArgs_
    )
        external
        payable
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
    {
        IERC20 _underlying = underlying_; // stack too deep

        if (block.chainid == 1) revert NotAvailableOnThisChain();
        if (leverage_ <= 1e18) revert LeverageTooLow();
        if (leverage_ > uint256(1e18).wadDiv(1e18 - depositToken_.collateralFactor())) revert LeverageTooHigh();
        if (address(_underlying) == address(0)) revert TokenInIsNull();

        // 1. transfer collateral
        // Note: Not performing tokenIn->depositToken swap here because is preferable to do cross-chain operations using naked tokens
        _underlying.safeTransferFrom(msg.sender, address(this), amountIn_);

        // 2. mint synth
        (uint256 _issued, ) = pool.debtTokenOf(syntheticToken_).flashIssue(
            address(syntheticToken_.proxyOFT()), // Note: Issue to `proxyOFT` to save transfer gas
            _calculateLeverageDebtAmount(_underlying, syntheticToken_, amountIn_, leverage_)
        );

        // 3. store request
        uint256 _id = layer2RequestId++;

        layer2Leverages[_id] = Layer2Leverage({
            underlying: _underlying,
            depositToken: depositToken_,
            syntheticToken: syntheticToken_,
            depositAmountMin: depositAmountMin_,
            tokenInAmountIn: amountIn_,
            syntheticTokenIssued: _issued,
            collateralDeposited: 0,
            account: msg.sender,
            finished: false
        });

        // 4. trigger L1 swap
        ILayer2ProxyOFT(address(syntheticToken_.proxyOFT())).triggerLeverageSwap{value: msg.value}({
            id_: _id,
            account_: payable(msg.sender),
            tokenOut_: address(_underlying),
            amountIn_: _issued,
            amountOutMin: layer1SwapAmountOutMin_,
            lzArgs_: lzArgs_
        });

        // TODO: Move params from storage to event
        emit Layer2LeverageStarted(_id);
    }

    // TODO: Comment
    // TODO: Should we have timeout param also like uniswap has?
    // TODO: Slippage should be increased only
    // TODO: Store and get clearCachedSwap params from storage
    function retryLayer2LeverageCallback(
        uint256 id_,
        uint256 newDepositAmountMin_,
        uint16 _srcChainId,
        bytes calldata srcAddress_,
        uint256 nonce_
    ) external {
        Layer2Leverage memory _request = layer2Leverages[id_];

        require(_request.account != address(0), "invalid-id");
        if (msg.sender != _request.account) revert SenderIsNotAccount();
        if (_request.finished) revert Layer2RequestCompletedAlready();

        layer2Leverages[id_].depositAmountMin = newDepositAmountMin_;

        _request.syntheticToken.proxyOFT().stargateRouter().clearCachedSwap(_srcChainId, srcAddress_, nonce_);
    }

    // TODO: Comment
    // TODO: Should we have timeout param also like uniswap has?
    // TODO: Slippage should be increased only
    // TODO: Store and get retryOFTReceived params from storage
    function retryLayer2FlashRepayCallback(
        uint256 id_,
        uint256 newRepayAmountMin_,
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint64 nonce_,
        bytes calldata from_,
        address to_,
        uint amount_,
        bytes calldata payload_
    ) external {
        Layer2FlashRepay memory _request = layer2FlashRepays[id_];

        // TODO: Custom error
        require(_request.account != address(0), "invalid-id");
        if (msg.sender != _request.account) revert SenderIsNotAccount();
        if (_request.finished) revert Layer2RequestCompletedAlready();

        layer2FlashRepays[id_].repayAmountMin = newRepayAmountMin_;

        _request.syntheticToken.proxyOFT().retryOFTReceived(
            srcChainId_,
            srcAddress_,
            nonce_,
            from_,
            to_,
            amount_,
            payload_
        );
    }

    // TODO
    //  - Comment
    //  - Reuse code from `leverage()`?
    function layer2LeverageCallback(
        uint256 id_,
        uint256 swapAmountOut_
    ) external override whenNotShutdown nonReentrant onlyIfProxyOFT returns (uint256 _deposited) {
        Layer2Leverage memory _leverage = layer2Leverages[id_];

        IPool _pool = pool;

        if (_leverage.account == address(0)) revert Layer2RequestInvalidKey();
        if (msg.sender != address(_leverage.syntheticToken.proxyOFT())) revert SenderIsNotProxyOFT();
        if (_leverage.finished) revert Layer2RequestCompletedAlready();
        IERC20 _collateral = _leverage.depositToken.underlying();

        // 1. transfer underlying (swapAmountOut)
        _leverage.underlying.transferFrom(msg.sender, address(this), swapAmountOut_);

        // 2. swap tokenIn for collateral if they aren't the same
        uint256 _tokenInAmount = _leverage.tokenInAmountIn + swapAmountOut_;
        uint256 _depositAmount = _leverage.underlying == _collateral
            ? _tokenInAmount
            : _swap(swapper, _leverage.underlying, _collateral, _tokenInAmount, 0);
        if (_depositAmount < _leverage.depositAmountMin) revert LeverageSlippageTooHigh();

        // 3. update state
        layer2Leverages[id_].collateralDeposited = _depositAmount;
        layer2Leverages[id_].finished = true;

        // 4. deposit collateral
        _collateral.safeApprove(address(_leverage.depositToken), 0);
        _collateral.safeApprove(address(_leverage.depositToken), _depositAmount);
        (_deposited, ) = _leverage.depositToken.deposit(_depositAmount, _leverage.account);

        // 5. mint debt
        _pool.debtTokenOf(_leverage.syntheticToken).mint(_leverage.account, _leverage.syntheticTokenIssued);

        // 6. check the health of the outcome position
        (bool _isHealthy, , , , ) = _pool.debtPositionOf(_leverage.account);
        if (!_isHealthy) revert PositionIsNotHealthy();

        emit Layer2LeverageFinished(id_);
    }

    /**
     * @notice Swap assets using Swapper contract
     * @param swapper_ The Swapper contract
     * @param tokenIn_ The token to swap from
     * @param tokenOut_ The token to swap to
     * @param amountIn_ The amount in
     * @param amountOutMin_ The minimum amount out (slippage check)
     * @return _amountOut The actual amount out
     */
    function _swap(
        ISwapper swapper_,
        IERC20 tokenIn_,
        IERC20 tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_
    ) private returns (uint256 _amountOut) {
        return _swap(swapper_, tokenIn_, tokenOut_, amountIn_, amountOutMin_, address(this));
    }

    function _swap(
        ISwapper swapper_,
        IERC20 tokenIn_,
        IERC20 tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMin_,
        address to_
    ) private returns (uint256 _amountOut) {
        tokenIn_.safeApprove(address(swapper_), 0);
        tokenIn_.safeApprove(address(swapper_), amountIn_);
        uint256 _tokenOutBefore = tokenOut_.balanceOf(to_);
        swapper_.swapExactInput(address(tokenIn_), address(tokenOut_), amountIn_, amountOutMin_, to_);
        return tokenOut_.balanceOf(to_) - _tokenOutBefore;
    }

    /**
     * @notice Update Swapper contract
     */
    function updateSwapper(ISwapper newSwapper_) external onlyGovernor {
        if (address(newSwapper_) == address(0)) revert AddressIsNull();
        ISwapper _currentSwapper = swapper;
        if (newSwapper_ == _currentSwapper) revert NewValueIsSameAsCurrent();

        emit SwapperUpdated(_currentSwapper, newSwapper_);
        swapper = newSwapper_;
    }
}
