// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Governable.sol";
import "./interface/IVSynth.sol";
import "./lib/WadRayMath.sol";
import "./interface/ITreasury.sol";
import "./interface/IIssuer.sol";
import "./Pausable.sol";

contract VSynthStorageV1 {
    /**
     * @notice The fee charged when depositing collateral
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public depositFee;

    /**
     * @notice The fee charged when minting a synthetic asset
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public mintFee;

    /**
     * @notice The fee charged when withdrawing collateral
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public withdrawFee;

    /**
     * @notice The fee charged when repaying debt
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public repayFee;

    /**
     * @notice The fee charged when swapping synthetic assets
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public swapFee;

    /**
     * @notice The fee charged when refinancing a debt
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public refinanceFee;

    /**
     * @notice The fee charged from liquidated deposit that goes to the liquidator
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public liquidatorFee;

    /**
     * @notice The fee charged when liquidating a position
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public liquidateFee;

    /**
     * @notice The max percent of the debt allowed to liquidate
     * @dev Use 18 decimals (e.g. 1e16 = 1%)
     */
    uint256 public maxLiquidable;

    /**
     * @notice Treasury contract
     */
    ITreasury public treasury;

    /**
     * @notice Prices oracle
     */
    IOracle public oracle;

    /**
     * @notice Issuer contract
     */
    IIssuer public issuer;
}

/**
 * @title vSynth main contract
 */
contract VSynth is IVSynth, ReentrancyGuard, Pausable, Governable, VSynthStorageV1 {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(IDepositToken indexed _collateral, address indexed account, uint256 amount);

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(IDepositToken indexed _collateral, address indexed account, uint256 amount);

    /// @notice Emitted when synthetic asset is minted
    event SyntheticAssetMinted(address indexed account, ISyntheticAsset indexed syntheticAsset, uint256 amount);

    /// @notice Emitted when synthetic's debt is repayed
    event DebtRepayed(address indexed account, ISyntheticAsset indexed syntheticAsset, uint256 amount);

    /// @notice Emitted when a position is liquidated
    event PositionLiquidated(
        address indexed liquidator,
        address indexed account,
        ISyntheticAsset indexed syntheticAsset,
        uint256 debtRepayed,
        uint256 depositSeized
    );

    /// @notice Emitted when synthetic asset is swapped
    event SyntheticAssetSwapped(
        address indexed account,
        ISyntheticAsset indexed syntheticAssetIn,
        ISyntheticAsset indexed syntheticAssetOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Emitted when debt is refinancied
    event DebtRefinancied(address indexed account, ISyntheticAsset syntheticAsset, uint256 amount);

    /// @notice Emitted when synthetic asset is enabled
    event SyntheticAssetAdded(ISyntheticAsset indexed syntheticAsset);

    /// @notice Emitted when synthetic asset is disabled
    event SyntheticAssetRemoved(ISyntheticAsset indexed syntheticAsset);

    /// @notice Emitted when deposit fee is updated
    event DepositFeeUpdated(uint256 oldDepositFee, uint256 newDepositFee);

    /// @notice Emitted when mint fee is updated
    event MintFeeUpdated(uint256 oldMintFee, uint256 newMintFee);

    /// @notice Emitted when withdraw fee is updated
    event WithdrawFeeUpdated(uint256 oldWithdrawFee, uint256 newWithdrawFee);

    /// @notice Emitted when repay fee is updated
    event RepayFeeUpdated(uint256 oldRepayFee, uint256 newRepayFee);

    /// @notice Emitted when swap fee is updated
    event SwapFeeUpdated(uint256 oldSwapFee, uint256 newSwapFee);

    /// @notice Emitted when refinance fee is updated
    event RefinanceFeeUpdated(uint256 oldRefinanceFee, uint256 newRefinanceFee);

    /// @notice Emitted when liquidator fee is updated
    event LiquidatorFeeUpdated(uint256 oldLiquidatorFee, uint256 newLiquidatorFee);

    /// @notice Emitted when maxLiquidable (liquidation cap) is updated
    event MaxLiquidableUpdated(uint256 oldMaxLiquidable, uint256 newMaxLiquidable);

    /// @notice Emitted when liquidate fee is updated
    event LiquidateFeeUpdated(uint256 oldLiquidateFee, uint256 newLiquidateFee);

    /// @notice Emitted when treasury contract is updated
    event TreasuryUpdated(ITreasury indexed oldTreasury, ITreasury indexed newTreasury);

    /// @notice Emitted when oracle contract is updated
    event OracleUpdated(IOracle indexed oldOracle, IOracle indexed newOracle);

    /**
     * @dev Throws if synthetic asset doesn't exist
     */
    modifier onlyIfSyntheticAssetExists(ISyntheticAsset _syntheticAsset) {
        require(issuer.isSyntheticAssetExists(_syntheticAsset), "synthetic-asset-does-not-exists");
        _;
    }

    /**
     * @dev Throws if synthetic asset isn't enabled
     */
    modifier onlyIfSyntheticAssetIsActive(ISyntheticAsset _syntheticAsset) {
        require(_syntheticAsset.isActive(), "synthetic-asset-is-not-active");
        _;
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    modifier onlyIfDepositTokenExists(IDepositToken _depositToken) {
        require(issuer.isDepositTokenExists(_depositToken), "collateral-does-not-exists");
        _;
    }

    /**
     * @dev Throws if collateral asset isn't enabled
     */
    modifier onlyIfDepositTokenIsActive(IDepositToken _depositToken) {
        require(_depositToken.isActive(), "collateral-is-not-active");
        _;
    }

    function initialize(
        ITreasury treasury_,
        IDepositToken depositToken_,
        IOracle oracle_,
        IIssuer issuer_
    ) public initializer {
        require(address(treasury_) != address(0), "treasury-address-is-null");
        require(address(depositToken_) != address(0), "deposit-token-is-null");
        require(address(oracle_) != address(0), "oracle-is-null");

        __ReentrancyGuard_init();
        __Governable_init();

        treasury = treasury_;
        oracle = oracle_;
        issuer = issuer_;

        depositFee = 0;
        mintFee = 0;
        withdrawFee = 0;
        repayFee = 3e15; // 0.3%
        swapFee = 6e15; // 0.6%
        refinanceFee = 15e15; // 1.5%
        liquidatorFee = 1e17; // 10%
        liquidateFee = 8e16; // 8%
        maxLiquidable = 1e18; // 100%
    }

    /**
     * @notice Deposit colleteral and mint vSynth-Collateral (tokenized deposit position)
     * @param _depositToken The collateral tokens to deposit
     * @param _amount The amount of collateral tokens to deposit
     */
    function deposit(IDepositToken _depositToken, uint256 _amount)
        external
        override
        whenNotPaused
        nonReentrant
        onlyIfDepositTokenExists(_depositToken)
        onlyIfDepositTokenIsActive(_depositToken)
    {
        require(_amount > 0, "zero-collateral-amount");

        address _account = _msgSender();

        _depositToken.underlying().safeTransferFrom(_account, address(treasury), _amount);

        uint256 _amountToMint = depositFee > 0 ? _amount.wadMul(1e18 - depositFee) : _amount;

        // We are collecting fee here by minting less deposit tokens than the collateral deposited
        issuer.mintDepositToken(_depositToken, _account, _amountToMint);

        emit CollateralDeposited(_depositToken, _account, _amountToMint);
    }

    /**
     * @notice Lock collateral and mint synthetic asset
     * @param _syntheticAsset The synthetic asset to mint
     * @param _amount The amount to mint
     */
    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount)
        external
        override
        whenNotShutdown
        onlyIfSyntheticAssetExists(_syntheticAsset)
        onlyIfSyntheticAssetIsActive(_syntheticAsset)
        nonReentrant
    {
        require(_amount > 0, "amount-to-mint-is-zero");

        address _account = _msgSender();

        require(_amount <= issuer.maxIssuableFor(_account, _syntheticAsset), "not-enough-collateral");

        uint256 _feeInSyntheticAsset;

        if (mintFee > 0) {
            _feeInSyntheticAsset = _amount.wadMul(mintFee);
            issuer.collectFee(_account, oracle.convertToUsd(_syntheticAsset, _feeInSyntheticAsset), true);
        }

        uint256 _amountToMint = _amount - _feeInSyntheticAsset;

        issuer.mintSyntheticAssetAndDebtToken(_syntheticAsset, _account, _amountToMint);

        emit SyntheticAssetMinted(_account, _syntheticAsset, _amountToMint);
    }

    /**
     * @notice Burn vSynth-Collateral and withdraw collateral
     * @param _amount The amount of collateral to withdraw
     */
    function withdraw(IDepositToken _depositToken, uint256 _amount)
        external
        override
        onlyIfDepositTokenExists(_depositToken)
        whenNotShutdown
        nonReentrant
    {
        require(_amount > 0, "amount-to-withdraw-is-zero");

        address _account = _msgSender();

        (, , , uint256 _unlockedDepositInUsd) = issuer.debtPositionOf(_account);
        uint256 _unlockedDeposit = oracle.convertFromUsd(_depositToken.underlying(), _unlockedDepositInUsd);

        require(_amount <= _unlockedDeposit, "amount-to-withdraw-gt-unlocked");

        issuer.burnWithdrawnDeposit(_depositToken, _account, _amount);

        uint256 _amountToWithdraw = withdrawFee > 0 ? _amount.wadMul(1e18 - withdrawFee) : _amount;

        treasury.pull(_depositToken.underlying(), _account, _amountToWithdraw);

        emit CollateralWithdrawn(_depositToken, _account, _amountToWithdraw);
    }

    /**
     * @notice Send synthetic asset to decrease debt
     * @dev Burn synthetic asset and equivalent debt token to unlock collateral
     * @param _syntheticAsset The synthetic asset to burn
     * @param _beneficiary The account that will have debt decreased
     * @param _payer The account to burn synthetic asset from
     * @param _amount The amount of synthetic asset to burn
     */
    function _repay(
        ISyntheticAsset _syntheticAsset,
        address _beneficiary,
        address _payer,
        uint256 _amount
    ) private onlyIfSyntheticAssetExists(_syntheticAsset) {
        require(_amount > 0, "amount-to-repay-is-zero");

        issuer.burnSyntheticAssetAndDebtToken(_syntheticAsset, _payer, _beneficiary, _amount);

        emit DebtRepayed(_beneficiary, _syntheticAsset, _amount);
    }

    /**
     * @notice Send synthetic asset to decrease debt
     * @dev The msg.sender is the payer and the account beneficied
     * @param _syntheticAsset The synthetic asset to burn
     * @param _beneficiary The account that will have debt decreased
     * @param _amount The amount of synthetic asset to burn
     */
    function repay(
        ISyntheticAsset _syntheticAsset,
        address _beneficiary,
        uint256 _amount
    ) external override whenNotShutdown nonReentrant {
        address _payer = _msgSender();
        _repay(_syntheticAsset, _beneficiary, _payer, _amount);

        // Charging fee after repayment to have more unlocked deposit balance,
        // and reducing chances to have tx reverted due to low unlocked deposit
        if (repayFee > 0) {
            uint256 _feeInUsd = oracle.convertToUsd(_syntheticAsset, _amount.wadMul(repayFee));
            issuer.collectFee(_beneficiary, _feeInUsd, true);
        }
    }

    /**
     * @notice Burn synthetic asset, unlock deposit token and send liquidator fee
     * @param _syntheticAsset The vsAsset to use for repayment
     * @param _account The account with an unhealty position
     * @param _amountToRepay The amount to repay
     */
    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay,
        IDepositToken _depositToken
    ) external override whenNotShutdown nonReentrant onlyIfDepositTokenExists(_depositToken) {
        require(_amountToRepay > 0, "amount-to-repay-is-zero");
        address _liquidator = _msgSender();
        require(_liquidator != _account, "can-not-liquidate-own-position");

        uint256 _percentOfDebtToLiquidate = _amountToRepay.wadDiv(_syntheticAsset.debtToken().balanceOf(_account));

        require(_percentOfDebtToLiquidate <= maxLiquidable, "amount-gt-max-liquidable");

        (bool _isHealthy, , uint256 _depositInUsd, ) = issuer.debtPositionOf(_account);
        uint256 _deposit = oracle.convertFromUsd(_depositToken.underlying(), _depositInUsd);

        require(!_isHealthy, "position-is-healthy");

        uint256 _amountToRepayInCollateral = oracle.convert(
            _syntheticAsset,
            _depositToken.underlying(),
            _amountToRepay
        );

        uint256 _feeToCollect = liquidateFee > 0 ? _amountToRepayInCollateral.wadMul(liquidateFee) : 0;
        uint256 _toLiquidator = _amountToRepayInCollateral + _amountToRepayInCollateral.wadMul(liquidatorFee);
        uint256 _totalToSeize = _feeToCollect + _toLiquidator;
        require(_totalToSeize <= _deposit, "amount-to-repay-is-too-high");

        _repay(_syntheticAsset, _account, _liquidator, _amountToRepay);

        issuer.seizeDepositToken(_depositToken, _account, _liquidator, _toLiquidator);

        if (_feeToCollect > 0) {
            uint256 _feeInUsd = oracle.convertToUsd(_depositToken.underlying(), _feeToCollect);
            issuer.collectFee(_account, _feeInUsd, false);
        }

        emit PositionLiquidated(_liquidator, _account, _syntheticAsset, _amountToRepay, _totalToSeize);
    }

    /**
     * @notice Swap synthetic assets
     * @param _account The account
     * @param _syntheticAssetIn Synthetic asset to sell
     * @param _syntheticAssetOut Synthetic asset to buy
     * @param _amountIn Amount to swap
     * @param _fee Fee to collect - Use 18 decimals (e.g. 1e16 = 1%)
     */
    function _swap(
        address _account,
        ISyntheticAsset _syntheticAssetIn,
        ISyntheticAsset _syntheticAssetOut,
        uint256 _amountIn,
        uint256 _fee
    )
        private
        onlyIfSyntheticAssetExists(_syntheticAssetIn)
        onlyIfSyntheticAssetExists(_syntheticAssetOut)
        onlyIfSyntheticAssetIsActive(_syntheticAssetOut)
        returns (uint256 _amountOut)
    {
        require(_amountIn > 0, "amount-in-is-zero");
        require(_amountIn <= _syntheticAssetIn.balanceOf(_account), "amount-in-gt-synthetic-balance");

        uint256 _feeInSyntheticAssetIn = _fee > 0 ? _amountIn.wadMul(_fee) : 0;
        uint256 _amountInAfterFee = _amountIn - _feeInSyntheticAssetIn;
        _amountOut = oracle.convert(_syntheticAssetIn, _syntheticAssetOut, _amountInAfterFee);

        issuer.burnSyntheticAssetAndDebtToken(_syntheticAssetIn, _account, _account, _amountIn);
        issuer.mintSyntheticAssetAndDebtToken(_syntheticAssetOut, _account, _amountOut);

        if (_feeInSyntheticAssetIn > 0) {
            uint256 _feeInUsd = oracle.convertToUsd(_syntheticAssetIn, _feeInSyntheticAssetIn);
            issuer.collectFee(_account, _feeInUsd, true);
        }

        (bool _isHealthy, , , ) = issuer.debtPositionOf(_account);

        require(_isHealthy, "debt-position-ended-up-unhealthy");

        emit SyntheticAssetSwapped(_account, _syntheticAssetIn, _syntheticAssetOut, _amountIn, _amountOut);
    }

    /**
     * @notice Swap synthetic assets
     * @param _syntheticAssetIn Synthetic asset to sell
     * @param _syntheticAssetOut Synthetic asset to buy
     * @param _amountIn Amount to swap
     */
    function swap(
        ISyntheticAsset _syntheticAssetIn,
        ISyntheticAsset _syntheticAssetOut,
        uint256 _amountIn
    ) external override whenNotShutdown nonReentrant returns (uint256 _amountOut) {
        address _account = _msgSender();
        (bool _isHealthy, , , ) = issuer.debtPositionOf(_account);
        require(_isHealthy, "debt-position-is-unhealthy");

        return _swap(_account, _syntheticAssetIn, _syntheticAssetOut, _amountIn, swapFee);
    }

    /**
     * @notice Refinance debt by swaping for vsETH (that has lower collateralization ratio)
     * @param _syntheticAssetIn Synthetic asset to sell
     * @param _amountToRefinance Amount to refinance
     */
    function refinance(ISyntheticAsset _syntheticAssetIn, uint256 _amountToRefinance)
        external
        override
        whenNotShutdown
        nonReentrant
    {
        ISyntheticAsset _syntheticAssetOut = issuer.vsEth();
        require(
            _syntheticAssetIn.collateralizationRatio() > _syntheticAssetOut.collateralizationRatio(),
            "in-cratio-is-lte-out-cratio"
        );
        address _account = _msgSender();
        (bool _isHealthy, , , ) = issuer.debtPositionOf(_account);
        require(!_isHealthy, "debt-position-is-healthy");

        _swap(_account, _syntheticAssetIn, _syntheticAssetOut, _amountToRefinance, refinanceFee);

        emit DebtRefinancied(_account, _syntheticAssetIn, _amountToRefinance);
    }

    /**
     * @notice Update treasury contract - will migrate funds to the new contract
     */
    function updateTreasury(ITreasury _newTreasury) external override onlyGovernor {
        require(address(_newTreasury) != address(0), "treasury-address-is-null");
        require(_newTreasury != treasury, "new-treasury-is-same-as-current");

        IDepositToken[] memory _depositTokens = issuer.getDepositTokens();
        for (uint256 i = 0; i < _depositTokens.length; ++i) {
            IERC20 _underlying = _depositTokens[i].underlying();
            uint256 _balance = _underlying.balanceOf(address(treasury));
            if (_balance > 0) {
                treasury.pull(_underlying, address(_newTreasury), _balance);
            }
        }

        emit TreasuryUpdated(treasury, _newTreasury);
        treasury = _newTreasury;
    }

    /**
     * @notice Update price oracle contract
     */
    function updateOracle(IOracle _newOracle) external override onlyGovernor {
        require(address(_newOracle) != address(0), "oracle-address-is-null");
        require(_newOracle != oracle, "new-oracle-is-same-as-current");

        emit OracleUpdated(oracle, _newOracle);
        oracle = _newOracle;
    }

    /**
     * @notice Update deposit fee
     */
    function updateDepositFee(uint256 _newDepositFee) external override onlyGovernor {
        require(_newDepositFee <= 1e18, "deposit-fee-gt-100%");
        emit DepositFeeUpdated(depositFee, _newDepositFee);
        depositFee = _newDepositFee;
    }

    /**
     * @notice Update mint fee
     */
    function updateMintFee(uint256 _newMintFee) external override onlyGovernor {
        require(_newMintFee <= 1e18, "mint-fee-gt-100%");
        emit MintFeeUpdated(mintFee, _newMintFee);
        mintFee = _newMintFee;
    }

    /**
     * @notice Update withdraw fee
     */
    function updateWithdrawFee(uint256 _newWithdrawFee) external override onlyGovernor {
        require(_newWithdrawFee <= 1e18, "withdraw-fee-gt-100%");
        emit WithdrawFeeUpdated(withdrawFee, _newWithdrawFee);
        withdrawFee = _newWithdrawFee;
    }

    /**
     * @notice Update repay fee
     */
    function updateRepayFee(uint256 _newRepayFee) external override onlyGovernor {
        require(_newRepayFee <= 1e18, "repay-fee-gt-100%");
        emit RepayFeeUpdated(repayFee, _newRepayFee);
        repayFee = _newRepayFee;
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(uint256 _newSwapFee) external override onlyGovernor {
        require(_newSwapFee <= 1e18, "swap-fee-gt-100%");
        emit SwapFeeUpdated(swapFee, _newSwapFee);
        swapFee = _newSwapFee;
    }

    /**
     * @notice Update refinance fee
     */
    function updateRefinanceFee(uint256 _newRefinanceFee) external override onlyGovernor {
        require(_newRefinanceFee <= 1e18, "refinance-fee-gt-100%");
        emit RefinanceFeeUpdated(refinanceFee, _newRefinanceFee);
        refinanceFee = _newRefinanceFee;
    }

    /**
     * @notice Update liquidator fee
     */
    function updateLiquidatorFee(uint256 _newLiquidatorFee) external override onlyGovernor {
        require(_newLiquidatorFee <= 1e18, "liquidator-fee-gt-100%");
        emit LiquidatorFeeUpdated(liquidatorFee, _newLiquidatorFee);
        liquidatorFee = _newLiquidatorFee;
    }

    /**
     * @notice Update liquidate fee
     */
    function updateLiquidateFee(uint256 _newLiquidateFee) external override onlyGovernor {
        require(_newLiquidateFee <= 1e18, "liquidate-fee-gt-100%");
        emit LiquidateFeeUpdated(liquidateFee, _newLiquidateFee);
        liquidateFee = _newLiquidateFee;
    }

    /**
     * @notice Update maxLiquidable (liquidation cap)
     */
    function updateMaxLiquidable(uint256 _newMaxLiquidable) external override onlyGovernor {
        require(_newMaxLiquidable != maxLiquidable, "new-value-is-same-as-current");
        require(_newMaxLiquidable <= 1e18, "max-liquidable-gt-100%");
        emit MaxLiquidableUpdated(maxLiquidable, _newMaxLiquidable);
        maxLiquidable = _newMaxLiquidable;
    }

    /**
     * @dev Pause new deposits
     */
    function pause() external onlyGovernor {
        _pause();
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyGovernor {
        _unpause();
    }

    /**
     * @dev Shutdown all features
     */
    function shutdown() external onlyGovernor {
        _shutdown();
    }

    /**
     * @dev Turn all features on
     */
    function open() external onlyGovernor {
        _open();
    }
}
