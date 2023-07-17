// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./utils/ReentrancyGuard.sol";
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

    string public constant VERSION = "1.2.0";

    /// @notice Emitted when a L2 leverage request is finalized
    event Layer2LeverageFinished(uint256 indexed id);

    /// @notice Emitted when a L2 leverage request is created
    event Layer2LeverageStarted(uint256 indexed id);

    /// @notice Emitted when a L2 flash repay request is finalized
    event Layer2FlashRepayFinished(uint256 indexed id);

    /// @notice Emitted when a L2 flash repay request is created
    event Layer2FlashRepayStarted(uint256 indexed id);

    /// @notice Emitted when debt is flash repaid
    event FlashRepaid(
        ISyntheticToken indexed syntheticToken,
        IDepositToken indexed depositToken,
        uint256 withdrawn,
        uint256 repaid
    );

    /// @notice Emitted when deposit is leveraged
    event Leveraged(
        IERC20 indexed tokenIn,
        IDepositToken indexed depositToken,
        ISyntheticToken indexed syntheticToken,
        uint256 leverage,
        uint256 amountIn,
        uint256 issued,
        uint256 deposited
    );

    /**
     * @dev Throws if sender isn't a valid ProxyOFT contract
     */
    modifier onlyIfProxyOFT() {
        ISyntheticToken _syntheticToken = ISyntheticToken(ILayer2ProxyOFT(msg.sender).token());
        if (!pool.doesSyntheticTokenExist(_syntheticToken) || address(_syntheticToken.proxyOFT()) != msg.sender) {
            revert SenderIsNotProxyOFT();
        }
        _;
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    modifier onlyIfDepositTokenExists(IDepositToken depositToken_) {
        if (!pool.doesDepositTokenExist(depositToken_)) revert DepositTokenDoesNotExist();
        _;
    }

    /**
     * @dev Throws if synthetic token doesn't exist
     */
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
        uint256 _amountToRepay = _swap(swapper(), depositToken_.underlying(), syntheticToken_, _withdrawn, 0);

        // 3. repay debt
        (_repaid, ) = _debtToken.repay(msg.sender, _amountToRepay);
        if (_repaid < repayAmountMin_) revert FlashRepaySlippageTooHigh();

        // 4. check the health of the outcome position
        (bool _isHealthy, , , , ) = _pool.debtPositionOf(msg.sender);
        if (!_isHealthy) revert PositionIsNotHealthy();

        emit FlashRepaid(syntheticToken_, depositToken_, _withdrawn, _repaid);
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

        ISwapper _swapper = swapper();

        // 1. transfer collateral
        IERC20 _collateral = depositToken_.underlying();
        amountIn_ = _collateralTransferFrom(msg.sender, _swapper, tokenIn_, _collateral, amountIn_);

        {
            // 2. mint synth + debt
            uint256 _debtAmount = _calculateLeverageDebtAmount(_collateral, syntheticToken_, amountIn_, leverage_);
            IDebtToken _debtToken = pool.debtTokenOf(syntheticToken_);
            (_issued, ) = _debtToken.flashIssue(address(this), _debtAmount);
            _debtToken.mint(msg.sender, _debtAmount);
        }

        // 3. swap synth for collateral
        uint256 _depositAmount = amountIn_ + _swap(_swapper, syntheticToken_, _collateral, _issued, 0);
        if (_depositAmount < depositAmountMin_) revert LeverageSlippageTooHigh();

        // 4. deposit collateral
        _collateral.safeApprove(address(depositToken_), 0);
        _collateral.safeApprove(address(depositToken_), _depositAmount);
        (_deposited, ) = depositToken_.deposit(_depositAmount, msg.sender);

        // 5. check the health of the outcome position
        (bool _isHealthy, , , , ) = pool.debtPositionOf(msg.sender);
        if (!_isHealthy) revert PositionIsNotHealthy();

        emit Leveraged(tokenIn_, depositToken_, syntheticToken_, leverage_, amountIn_, _issued, _deposited);
    }

    /***
     * @notice Flash debt repayment for L2 chains
     * @param syntheticToken_ The debt token to repay
     * @param depositToken_ The collateral to withdraw
     * @param withdrawAmount_ The amount to withdraw
     * @param underlying_ The underlying asset (e.g. USDC is vaUSDC's underlying)
     * @param underlyingAmountMin_ The minimum amount out for collateral->underlying swap (slippage check)
     * @param layer1SwapAmountOutMin_ The minimum amount out for underlying->msAsset swap (slippage check)
     * @param repayAmountMin_ The minimum amount to repay (slippage check)
     * @param layer1LzArgs_ The LayerZero params (See: `Layer1ProxyOFT.getFlashRepaySwapAndCallbackLzArgs()`)
     */
    function layer2FlashRepay(
        ISyntheticToken syntheticToken_,
        IDepositToken depositToken_,
        uint256 withdrawAmount_,
        IERC20 underlying_,
        uint256 underlyingAmountMin_,
        uint256 layer1SwapAmountOutMin_,
        uint256 repayAmountMin_,
        bytes calldata layer1LzArgs_
    )
        external
        payable
        override
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
    {
        if (_chainId() == 1) revert NotAvailableOnThisChain();
        if (withdrawAmount_ == 0) revert AmountIsZero();
        if (repayAmountMin_ > pool.debtTokenOf(syntheticToken_).balanceOf(msg.sender)) revert AmountIsTooHigh();

        address _proxyOFT;
        uint256 _amountIn;
        {
            _proxyOFT = address(syntheticToken_.proxyOFT());

            // 1. withdraw collateral
            // Note: No need to check healthy because this function ensures withdrawing only from unlocked balance
            (uint256 _withdrawn, ) = depositToken_.withdrawFrom(msg.sender, withdrawAmount_, address(this));

            // 2. swap collateral for its underlying
            // Note: Swap to `proxyOFT` to save transfer gas
            _amountIn = _swap(
                swapper(),
                depositToken_.underlying(),
                underlying_,
                _withdrawn,
                underlyingAmountMin_,
                _proxyOFT
            );
        }

        // 3. store request
        uint256 _id = ++layer2RequestId;

        layer2FlashRepays[_id] = Layer2FlashRepay({
            syntheticToken: syntheticToken_,
            repayAmountMin: repayAmountMin_,
            account: msg.sender,
            finished: false
        });

        // 4. trigger L1  swap
        ILayer2ProxyOFT(_proxyOFT).triggerFlashRepaySwap{value: msg.value}({
            id_: _id,
            account_: payable(msg.sender),
            tokenIn_: address(underlying_),
            amountIn_: _amountIn,
            amountOutMin_: layer1SwapAmountOutMin_,
            lzArgs_: layer1LzArgs_
        });

        emit Layer2FlashRepayStarted(_id);
    }

    /**
     * @notice Finalize L2 flash debt repayment process
     * @dev Receives msAsset from L1 and use it to repay
     * @param id_ The id of the request
     * @param swapAmountOut_ The msAsset amount received from L1 swap
     * @return _repaid The debt amount repaid
     */
    function layer2FlashRepayCallback(
        uint256 id_,
        uint256 swapAmountOut_
    ) external override whenNotShutdown nonReentrant onlyIfProxyOFT returns (uint256 _repaid) {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        IPool _pool = pool;
        Layer2FlashRepay memory _request = layer2FlashRepays[id_];

        if (_request.account == address(0)) revert Layer2RequestInvalidKey();
        if (msg.sender != address(_request.syntheticToken.proxyOFT())) revert SenderIsNotProxyOFT();
        if (_request.finished) revert Layer2RequestCompletedAlready();

        // 1. update state
        layer2FlashRepays[id_].finished = true;

        // 2. transfer synthetic token (swapAmountOut)
        _request.syntheticToken.safeTransferFrom(msg.sender, address(this), swapAmountOut_);

        // 3. repay debt
        (_repaid, ) = _pool.debtTokenOf(_request.syntheticToken).repay(_request.account, swapAmountOut_);
        if (_repaid < _request.repayAmountMin) revert FlashRepaySlippageTooHigh();

        emit Layer2FlashRepayFinished(id_);
    }

    /***
     * @notice Leverage for L2 chains
     * @param underlying_ The underlying asset (e.g. USDC is vaUSDC's underlying)
     * @param depositToken_ The collateral to deposit
     * @param syntheticToken_ The msAsset to mint
     * @param amountIn_ The amount to deposit
     * @param leverage_ The leverage X param (e.g. 1.5e18 for 1.5X)
     * @param layer1SwapAmountOutMin_ The minimum amount out for msAsset->underlying swap (slippage check)
     * @param depositAmountMin_ The minimum amount to deposit (slippage check)
     * @param layer1LzArgs_ The LayerZero params (See: `Layer1ProxyOFT.getLeverageSwapAndCallbackLzArgs()`)
     */
    function layer2Leverage(
        IERC20 underlying_,
        IDepositToken depositToken_,
        ISyntheticToken syntheticToken_,
        uint256 amountIn_,
        uint256 leverage_,
        uint256 layer1SwapAmountOutMin_,
        uint256 depositAmountMin_,
        bytes calldata layer1LzArgs_
    )
        external
        payable
        override
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
    {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        IERC20 _underlying = underlying_; // stack too deep

        if (leverage_ <= 1e18) revert LeverageTooLow();
        if (leverage_ > uint256(1e18).wadDiv(1e18 - depositToken_.collateralFactor())) revert LeverageTooHigh();
        if (address(_underlying) == address(0)) revert TokenInIsNull();

        // 1. transfer collateral
        // Note: Using underlying instead of collateral because it's preferable to do cross-chain operations using "naked tokens"
        _underlying.safeTransferFrom(msg.sender, address(this), amountIn_);

        // 2. mint synth
        // Note: Issue to `proxyOFT` to save transfer gas
        (uint256 _issued, ) = pool.debtTokenOf(syntheticToken_).flashIssue(
            address(syntheticToken_.proxyOFT()),
            _calculateLeverageDebtAmount(_underlying, syntheticToken_, amountIn_, leverage_)
        );

        // 3. store request
        uint256 _id = ++layer2RequestId;

        layer2Leverages[_id] = Layer2Leverage({
            underlying: _underlying,
            depositToken: depositToken_,
            syntheticToken: syntheticToken_,
            depositAmountMin: depositAmountMin_,
            tokenInAmountIn: amountIn_,
            syntheticTokenIssued: _issued,
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
            lzArgs_: layer1LzArgs_
        });

        emit Layer2LeverageStarted(_id);
    }

    /**
     * @notice Finalize L2 leverage process
     * @dev Receives underlying from L1 and use it to deposit
     * @param id_ The id of the request
     * @param swapAmountOut_ The underlying amount received from L1 swap
     * @return _deposited The amount deposited
     */
    function layer2LeverageCallback(
        uint256 id_,
        uint256 swapAmountOut_
    ) external override nonReentrant onlyIfProxyOFT returns (uint256 _deposited) {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        Layer2Leverage memory _leverage = layer2Leverages[id_];
        IPool _pool = pool;

        if (_leverage.account == address(0)) revert Layer2RequestInvalidKey();
        if (msg.sender != address(_leverage.syntheticToken.proxyOFT())) revert SenderIsNotProxyOFT();
        if (_leverage.finished) revert Layer2RequestCompletedAlready();
        IERC20 _collateral = _leverage.depositToken.underlying();

        // 1. transfer underlying (swapAmountOut)
        _leverage.underlying.safeTransferFrom(msg.sender, address(this), swapAmountOut_);

        // 2. swap tokenIn for collateral if they aren't the same
        uint256 _tokenInAmount = _leverage.tokenInAmountIn + swapAmountOut_;
        uint256 _depositAmount = _leverage.underlying == _collateral
            ? _tokenInAmount
            : _swap(swapper(), _leverage.underlying, _collateral, _tokenInAmount, 0);
        if (_depositAmount < _leverage.depositAmountMin) revert LeverageSlippageTooHigh();

        // 3. update state
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
     * @notice Estimate native fee needed to pay for the L2 flash repay
     * @dev Because the quotation may vary from block to block,
     *      it's recommended to send higher fee than the `_nativeFee` when calling
     *      because it'll avoid transaction to fail and any extra fee will be refunded to caller.
     * @param syntheticToken_ The synthetic token to repay
     * @param lzArgs_ The LayerZero params (See: `Layer1ProxyOFT.getFlashRepaySwapAndCallbackLzArgs()`)
     */
    function quoteLayer2FlashRepayNativeFee(
        ISyntheticToken syntheticToken_,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        return ILayer2ProxyOFT(address(syntheticToken_.proxyOFT())).quoteTriggerFlashRepaySwapNativeFee(lzArgs_);
    }

    /**
     * @notice Estimate native fee needed to pay for the L2 leverage
     * @dev Because the quotation may vary from block to block,
     *      it's recommended to send higher fee than the `_nativeFee` when calling
     *      because it'll avoid transaction to fail and any extra fee will be refunded to caller.
     * @param syntheticToken_ The synthetic token to repay
     * @param lzArgs_ The LayerZero params (See: `Layer1ProxyOFT.getLeverageSwapAndCallbackLzArgs()`)
     */
    function quoteLayer2LeverageNativeFee(
        ISyntheticToken syntheticToken_,
        bytes calldata lzArgs_
    ) external view returns (uint256 _nativeFee) {
        return ILayer2ProxyOFT(address(syntheticToken_.proxyOFT())).quoteTriggerLeverageSwapNativeFee(lzArgs_);
    }

    /**
     * @notice Retry L2 flash repay callback
     * @dev This function is used to recover from callback failures due to slippage
     * @param id_ The id of the request
     * @param newRepayAmountMin_ Updated slippage check param
     * @param srcChainId_ The source chain of failed tx
     * @param srcAddress_ The source path of failed tx
     * @param nonce_ The nonce of failed tx
     * @param amount_ The amount of failed tx
     * @param payload_ The payload of failed tx
     */
    function retryLayer2FlashRepayCallback(
        uint256 id_,
        uint256 newRepayAmountMin_,
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint64 nonce_,
        uint amount_,
        bytes calldata payload_
    ) external {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        Layer2FlashRepay memory _request = layer2FlashRepays[id_];

        if (_request.account == address(0)) revert Layer2RequestInvalidKey();
        if (msg.sender != _request.account) revert SenderIsNotAccount();
        if (_request.finished) revert Layer2RequestCompletedAlready();

        layer2FlashRepays[id_].repayAmountMin = newRepayAmountMin_;

        IProxyOFT _proxyOFT = _request.syntheticToken.proxyOFT();

        bytes memory _from = abi.encodePacked(_proxyOFT.getProxyOFTOf(srcChainId_));

        _proxyOFT.retryOFTReceived({
            _srcChainId: srcChainId_,
            _srcAddress: srcAddress_,
            _nonce: nonce_,
            _from: _from,
            _to: address(_proxyOFT),
            _amount: amount_,
            _payload: payload_
        });
    }

    /**
     * @notice Retry L2 leverage callback
     * @dev This function is used to recover from callback failures due to slippage
     * @param id_ The id of the request
     * @param newDepositAmountMin_ Updated slippage check param
     * @param srcChainId_ The source chain of failed tx
     * @param srcAddress_ The source path of failed tx
     * @param nonce_ The nonce of failed tx
     */
    function retryLayer2LeverageCallback(
        uint256 id_,
        uint256 newDepositAmountMin_,
        uint16 srcChainId_,
        bytes calldata srcAddress_,
        uint256 nonce_
    ) external {
        if (_chainId() == 1) revert NotAvailableOnThisChain();

        Layer2Leverage memory _request = layer2Leverages[id_];

        if (_request.account == address(0)) revert Layer2RequestInvalidKey();
        if (msg.sender != _request.account) revert SenderIsNotAccount();
        if (_request.finished) revert Layer2RequestCompletedAlready();

        layer2Leverages[id_].depositAmountMin = newDepositAmountMin_;

        _request.syntheticToken.poolRegistry().stargateRouter().clearCachedSwap(srcChainId_, srcAddress_, nonce_);
    }

    /**
     * @notice Get the swapper contract
     */
    function swapper() public view returns (ISwapper _swapper) {
        return pool.poolRegistry().swapper();
    }

    /**
     * @notice Calculate debt to issue for a leverage operation
     * @param _collateral The collateral to deposit
     * @param syntheticToken_ The msAsset to mint
     * @param amountIn_ The amount to deposit
     * @param leverage_ The leverage X param (e.g. 1.5e18 for 1.5X)
     * @return _debtAmount The debt issue
     */
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
     * @dev Encapsulates chainId call for better tests fit
     * Refs: https://github.com/NomicFoundation/hardhat/issues/3074
     */
    function _chainId() internal view virtual returns (uint256) {
        return block.chainid;
    }

    /**
     * @notice Get collateral from user
     * @dev If `tokenIn` isn't the collateral, perform a swap
     * @param from_ The account to get tokens from
     * @param swapper_ The Swapper contract
     * @param tokenIn_ The token to transfer from user
     * @param collateral_ The collateral token to get
     * @param amountIn_ The token in amount
     * @return _transferredAmount The collateral output amount
     */
    function _collateralTransferFrom(
        address from_,
        ISwapper swapper_,
        IERC20 tokenIn_,
        IERC20 collateral_,
        uint256 amountIn_
    ) private returns (uint256 _transferredAmount) {
        if (address(tokenIn_) == address(0)) tokenIn_ = collateral_;
        tokenIn_.safeTransferFrom(from_, address(this), amountIn_);
        if (tokenIn_ != collateral_) {
            // Note: `amountOutMin_` is `0` because slippage will be checked later on
            return _swap(swapper_, tokenIn_, collateral_, amountIn_, 0);
        }
        return amountIn_;
    }

    /**
     * @notice Swap assets using Swapper contract
     * @dev Use `address(this)` as amount out receiver
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

    /**
     * @notice Swap assets using Swapper contract
     * @param swapper_ The Swapper contract
     * @param tokenIn_ The token to swap from
     * @param tokenOut_ The token to swap to
     * @param amountIn_ The amount in
     * @param amountOutMin_ The minimum amount out (slippage check)
     * @param to_ The amount out receiver
     * @return _amountOut The actual amount out
     */
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
}
