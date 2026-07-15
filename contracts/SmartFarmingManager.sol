// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {SafeERC20} from "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {Math} from "./dependencies/openzeppelin/utils/math/Math.sol";
import {IERC20} from "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {Initializable} from "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import {Manageable} from "./access/Manageable.sol";
import {ReentrancyGuardDeprecated} from "./utils/ReentrancyGuardDeprecated.sol";
import {ReentrancyGuardTransient} from "./utils/ReentrancyGuardTransient.sol";
import {WadRayMath} from "./lib/WadRayMath.sol";
import {ISyntheticToken} from "./interfaces/ISyntheticToken.sol";
import {IDepositToken} from "./interfaces/IDepositToken.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IDebtToken} from "./interfaces/IDebtToken.sol";
import {ISwapper} from "./interfaces/external/ISwapper.sol";
import {SmartFarmingManagerStorageV1} from "./storage/SmartFarmingManagerStorage.sol";

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

/**
 * @title SmartFarmingManager contract
 */
contract SmartFarmingManager is
    Initializable,
    ReentrancyGuardDeprecated,
    ReentrancyGuardTransient,
    Manageable,
    SmartFarmingManagerStorageV1
{
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using WadRayMath for uint256;

    string public constant VERSION = "1.3.2";

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

    constructor() {
        _disableInitializers();
    }

    function initialize(IPool pool_) public initializer {
        if (address(pool_) == address(0)) revert PoolIsNull();
        __Manageable_init(pool_);
    }

    /**
     * @notice Flash debt repayment
     * @param syntheticToken_ The debt token to repay
     * @param depositToken_ The collateral to withdraw
     * @param withdrawAmount_ The amount to withdraw
     * @param swapAmountOutMin_ The minimum amount to repay (slippage check)
     */
    function flashRepay(
        ISyntheticToken syntheticToken_,
        IDepositToken depositToken_,
        uint256 withdrawAmount_,
        uint256 swapAmountOutMin_
    )
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfDepositTokenExists(depositToken_)
        onlyIfSyntheticTokenExists(syntheticToken_)
        returns (uint256 _withdrawn, uint256 _repaid)
    {
        ISyntheticToken _syntheticToken = syntheticToken_; // stack too deep

        address _msgSender = _msgSender();
        if (withdrawAmount_ == 0) revert AmountIsZero();
        if (withdrawAmount_ > depositToken_.balanceOf(_msgSender)) revert AmountIsTooHigh();
        IPool _pool = pool;
        IDebtToken _debtToken = _pool.debtTokenOf(_syntheticToken);
        if (swapAmountOutMin_ > _debtToken.balanceOf(_msgSender)) revert AmountIsTooHigh();

        // 1. withdraw collateral
        (_withdrawn, ) = depositToken_.flashWithdraw(_msgSender, withdrawAmount_);

        // 2. swap it for synth
        uint256 _swapAmountOut = _swap(swapper(), _collateralOf(depositToken_), _syntheticToken, _withdrawn, 0);
        if (_swapAmountOut < swapAmountOutMin_) revert FlashRepaySlippageTooHigh();

        (uint256 _maxRepayAmount, ) = _debtToken.quoteRepayIn(_debtToken.balanceOf(_msgSender));
        uint256 _amountToRepay = Math.min(_swapAmountOut, _maxRepayAmount);

        // 3. repay debt
        (_repaid, ) = _debtToken.repay(_msgSender, _amountToRepay);

        // 4. refund synthetic token in excess
        if (_swapAmountOut > _amountToRepay) {
            _syntheticToken.safeTransfer(_msgSender, _swapAmountOut - _amountToRepay);
        }

        // 5. check the health of the outcome position
        (bool _isHealthy, , , , ) = _pool.debtPositionOf(_msgSender);
        if (!_isHealthy) revert PositionIsNotHealthy();

        emit FlashRepaid(_syntheticToken, depositToken_, _withdrawn, _repaid);
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
        if (amountIn_ == 0) revert AmountIsZero();
        if (leverage_ <= 1e18) revert LeverageTooLow();
        if (leverage_ > uint256(1e18).wadDiv(1e18 - depositToken_.collateralFactor())) revert LeverageTooHigh();

        address _msgSender = _msgSender();
        ISwapper _swapper = swapper();

        // 1. transfer collateral
        IERC20 _collateral = _collateralOf(depositToken_);
        if (address(tokenIn_) == address(0)) tokenIn_ = _collateral;
        amountIn_ = _safeTransferFrom(tokenIn_, _msgSender, amountIn_);
        if (tokenIn_ != _collateral) {
            // Note: `amountOutMin_` is `0` because slippage will be checked later on
            amountIn_ = _swap(_swapper, tokenIn_, _collateral, amountIn_, 0);
        }

        {
            // 2. mint synth + debt
            uint256 _debtAmount = _calculateLeverageDebtAmount(_collateral, syntheticToken_, amountIn_, leverage_);
            IDebtToken _debtToken = pool.debtTokenOf(syntheticToken_);
            (_issued, ) = _debtToken.flashIssue(address(this), _debtAmount);
            _debtToken.mint(_msgSender, _debtAmount);
        }

        {
            // 3. swap synth for collateral
            uint256 _depositAmount = amountIn_ + _swap(_swapper, syntheticToken_, _collateral, _issued, 0);
            if (_depositAmount < depositAmountMin_) revert LeverageSlippageTooHigh();

            // 4. deposit collateral
            _collateral.safeApprove(address(depositToken_), 0);
            _collateral.safeApprove(address(depositToken_), _depositAmount);
            (_deposited, ) = depositToken_.deposit(_depositAmount, _msgSender);
        }

        // 5. check the health of the outcome position
        (bool _isHealthy, , , , ) = pool.debtPositionOf(_msgSender);
        if (!_isHealthy) revert PositionIsNotHealthy();

        emit Leveraged(tokenIn_, depositToken_, syntheticToken_, leverage_, amountIn_, _issued, _deposited);
    }

    /**
     * @notice Get the swapper contract
     */
    function swapper() public view returns (ISwapper _swapper) {
        return pool.poolRegistry().swapper();
    }

    /**
     * @notice Calculate debt to issue for a leverage operation
     * @param collateral_ The collateral to deposit
     * @param syntheticToken_ The msAsset to mint
     * @param amountIn_ The amount to deposit
     * @param leverage_ The leverage X param (e.g. 1.5e18 for 1.5X)
     * @return _debtAmount The debt issue
     */
    function _calculateLeverageDebtAmount(
        IERC20 collateral_,
        ISyntheticToken syntheticToken_,
        uint256 amountIn_,
        uint256 leverage_
    ) private view returns (uint256 _debtAmount) {
        return
            pool.masterOracle().quote(
                address(collateral_),
                address(syntheticToken_),
                (leverage_ - 1e18).wadMul(amountIn_)
            );
    }

    /**
     * @dev `collateral` is a better name than `underlying`
     * See more: https://github.com/autonomoussoftware/metronome-synth/issues/905
     */
    function _collateralOf(IDepositToken depositToken_) private view returns (IERC20) {
        return depositToken_.underlying();
    }

    /**
     * @notice Transfer token and check actual amount transferred
     * @param token_ The token to transfer
     * @param from_ The account to get tokens from
     * @param amount_ The amount to transfer
     * @return _transferred The actual transferred amount
     */
    function _safeTransferFrom(IERC20 token_, address from_, uint256 amount_) private returns (uint256 _transferred) {
        uint256 _before = token_.balanceOf(address(this));
        token_.safeTransferFrom(from_, address(this), amount_);
        return token_.balanceOf(address(this)) - _before;
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
        if (tokenIn_ != tokenOut_) {
            tokenIn_.safeApprove(address(swapper_), 0);
            tokenIn_.safeApprove(address(swapper_), amountIn_);
            uint256 _tokenOutBefore = tokenOut_.balanceOf(to_);
            swapper_.swapExactInput(address(tokenIn_), address(tokenOut_), amountIn_, amountOutMin_, to_);
            return tokenOut_.balanceOf(to_) - _tokenOutBefore;
        } else if (to_ != address(this)) {
            tokenIn_.safeTransfer(to_, amountIn_);
        }
        return amountIn_;
    }
}
