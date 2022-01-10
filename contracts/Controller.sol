// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/utils/math/Math.sol";
import "./storage/ControllerStorage.sol";
import "./lib/WadRayMath.sol";
import "./Pausable.sol";

/**
 * @title Controller contract
 */
contract Controller is ReentrancyGuard, Pausable, ControllerStorageV1 {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when synthetic asset is enabled
    event SyntheticAssetAdded(address indexed syntheticAsset);

    /// @notice Emitted when synthetic asset is disabled
    event SyntheticAssetRemoved(ISyntheticAsset indexed syntheticAsset);

    /// @notice Emitted when deposit token is enabled
    event DepositTokenAdded(address indexed depositToken);

    /// @notice Emitted when deposit token is disabled
    event DepositTokenRemoved(IDepositToken indexed depositToken);

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(
        IDepositToken indexed _collateral,
        address indexed from,
        address indexed account,
        uint256 amount,
        uint256 fee
    );

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(
        IDepositToken indexed _collateral,
        address indexed account,
        address indexed to,
        uint256 amount,
        uint256 fee
    );

    /// @notice Emitted when synthetic asset is minted
    event SyntheticAssetMinted(
        address indexed account,
        address indexed to,
        ISyntheticAsset indexed syntheticAsset,
        uint256 amount,
        uint256 fee
    );

    /// @notice Emitted when synthetic's debt is repayed
    event DebtRepayed(address indexed account, ISyntheticAsset indexed syntheticAsset, uint256 amount, uint256 fee);

    /// @notice Emitted when a position is liquidated
    event PositionLiquidated(
        address indexed liquidator,
        address indexed account,
        ISyntheticAsset indexed syntheticAsset,
        uint256 amountRepayed,
        uint256 depositSeized,
        uint256 fee
    );

    /// @notice Emitted when synthetic asset is swapped
    event SyntheticAssetSwapped(
        address indexed account,
        ISyntheticAsset indexed syntheticAssetIn,
        ISyntheticAsset indexed syntheticAssetOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    /// @notice Emitted when debt is refinancied
    event DebtRefinancied(
        address indexed account,
        ISyntheticAsset syntheticAsset,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    /// @notice Emitted when liquidate fee is updated
    event DebtFloorUpdated(uint256 oldDebtFloorInUsd, uint256 newDebtFloorInUsd);

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

    /// @notice Emitted when oracle contract is updated
    event OracleUpdated(IOracle indexed oldOracle, IOracle indexed newOracle);

    /// @notice Emitted when treasury contract is updated
    event TreasuryUpdated(ITreasury indexed oldTreasury, ITreasury indexed newTreasury);

    function initialize(IOracle _oracle, ITreasury _treasury) public initializer {
        require(address(_treasury) != address(0), "treasury-is-null");
        require(address(_oracle) != address(0), "oracle-is-null");

        __ReentrancyGuard_init();
        __Governable_init();

        oracle = _oracle;
        treasury = _treasury;

        repayFee = 3e15; // 0.3%
        swapFee = 6e15; // 0.6%
        liquidatorFee = 1e17; // 10%
        liquidateFee = 8e16; // 8%
        maxLiquidable = 1e18; // 100%
    }

    /**
     * @dev Throws if synthetic asset doesn't exist
     */
    function onlyIfSyntheticAssetExists(ISyntheticAsset _syntheticAsset) private view {
        require(isSyntheticAssetExists(_syntheticAsset), "asset-inexistent");
    }

    /**
     * @dev Throws if synthetic asset isn't enabled
     */
    function onlyIfSyntheticAssetIsActive(ISyntheticAsset _syntheticAsset) private view {
        require(_syntheticAsset.isActive(), "asset-inactive");
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    function onlyIfDepositTokenExists(IDepositToken _depositToken) private view {
        require(isDepositTokenExists(_depositToken), "collateral-inexistent");
    }

    /**
     * @dev Throws if collateral asset isn't enabled
     */
    function onlyIfDepositTokenIsActive(IDepositToken _depositToken) private view {
        require(_depositToken.isActive(), "collateral-inactive");
    }

    /**
     * @notice Get all synthetic assets
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getSyntheticAssets() external view override returns (address[] memory) {
        return syntheticAssets.values();
    }

    /**
     * @notice Get all deposit tokens
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getDepositTokens() external view override returns (address[] memory) {
        return depositTokens.values();
    }

    /**
     * @notice Check if token is part of the synthetic offerings
     * @param _syntheticAsset Asset to check
     * @return true if exist
     */
    function isSyntheticAssetExists(ISyntheticAsset _syntheticAsset) public view override returns (bool) {
        return syntheticAssets.contains(address(_syntheticAsset));
    }

    /**
     * @notice Check if collateral is supported
     * @param _depositToken Asset to check
     * @return true if exist
     */
    function isDepositTokenExists(IDepositToken _depositToken) public view override returns (bool) {
        return depositTokens.contains(address(_depositToken));
    }

    /**
     * @notice Get account's debt by querying latest prices from oracles
     * @dev We can optimize this function by storing an array of which synthetics the account minted avoiding looping all
     * @param _account The account to check
     * @return _debtInUsd The debt value in USD
     * @return _lockedDepositInUsd The USD amount that's covering the debt (considering collateralization ratios)
     */
    function debtOf(address _account) public view override returns (uint256 _debtInUsd, uint256 _lockedDepositInUsd) {
        for (uint256 i = 0; i < syntheticAssets.length(); ++i) {
            ISyntheticAsset _syntheticAsset = ISyntheticAsset(syntheticAssets.at(i));
            uint256 _amount = _syntheticAsset.debtToken().balanceOf(_account);
            if (_amount > 0) {
                uint256 _amountInUsd = oracle.convertToUsd(_syntheticAsset, _amount);
                _debtInUsd += _amountInUsd;
                _lockedDepositInUsd += _amountInUsd.wadMul(_syntheticAsset.collateralizationRatio());
            }
        }
    }

    /**
     * @notice Get account's total collateral deposited by querying latest prices from oracles
     * @dev We can optimize this function by storing an array of which deposit toekns the account deposited avoiding looping all
     * @param _account The account to check
     * @return _depositInUsd The total deposit value in USD among all collaterals
     */
    function depositOf(address _account) public view override returns (uint256 _depositInUsd) {
        for (uint256 i = 0; i < depositTokens.length(); ++i) {
            uint256 _amount = IDepositToken(depositTokens.at(i)).balanceOf(_account);
            if (_amount > 0) {
                uint256 _amountInUsd = oracle.convertToUsd(IDepositToken(depositTokens.at(i)).underlying(), _amount);
                _depositInUsd += _amountInUsd;
            }
        }
    }

    /**
     * @notice Get debt position from an account
     * @param _account The account to check
     * @return _isHealthy Whether the account's position is healthy
     * @return _lockedDepositInUsd The amount of deposit (is USD) that's covering all debt (considering collateralization ratios)
     * @return _depositInUsd The total collateral deposited in USD
     * @return _unlockedDepositInUsd The amount of deposit (is USD) that isn't covering the account's debt
     */
    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _unlockedDepositInUsd
        )
    {
        (, _lockedDepositInUsd) = debtOf(_account);

        (_depositInUsd) = depositOf(_account);

        _unlockedDepositInUsd = _depositInUsd > _lockedDepositInUsd ? _depositInUsd - _lockedDepositInUsd : 0;

        _isHealthy = _depositInUsd >= _lockedDepositInUsd;
    }

    /**
     * @notice Get max issuable synthetic asset amount for a given account
     * @param _account The account to check
     * @param _syntheticAsset The synthetic asset to check issuance
     * @return _maxIssuable The max issuable amount
     */
    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset)
        public
        view
        override
        returns (uint256 _maxIssuable)
    {
        onlyIfSyntheticAssetExists(_syntheticAsset);

        if (_syntheticAsset.isActive()) {
            (, , , uint256 __unlockedDepositInUsd) = debtPositionOf(_account);

            _maxIssuable = oracle.convertFromUsd(
                _syntheticAsset,
                __unlockedDepositInUsd.wadDiv(_syntheticAsset.collateralizationRatio())
            );
        }
    }

    /**
     * @notice Accrue interest for a given synthetic asset's debts
     * @param _syntheticAsset The synthetic asset's to accrue interest from
     */
    function accrueInterest(ISyntheticAsset _syntheticAsset) public {
        uint256 _interestAccumulated = _syntheticAsset.debtToken().accrueInterest();

        if (_interestAccumulated > 0) {
            // Note: We can save some gas by incrementing only and mint all accrue amount later
            _syntheticAsset.mint(address(treasury), _interestAccumulated);
        }
    }

    /**
     * @notice Deposit colleteral and mint vSynth-Collateral (tokenized deposit position)
     * @param _depositToken The collateral tokens to deposit
     * @param _amount The amount of collateral tokens to deposit
     * @param _onBehalfOf The account to deposit to
     */
    function deposit(
        IDepositToken _depositToken,
        uint256 _amount,
        address _onBehalfOf
    ) external override whenNotPaused nonReentrant {
        require(_amount > 0, "amount-is-zero");
        onlyIfDepositTokenExists(_depositToken);
        onlyIfDepositTokenIsActive(_depositToken);

        address _sender = _msgSender();

        if (_amount == type(uint256).max) {
            _amount = _depositToken.underlying().balanceOf(_sender);
        }

        uint256 _balanceBefore = _depositToken.underlying().balanceOf(address(treasury));

        _depositToken.underlying().safeTransferFrom(_sender, address(treasury), _amount);

        _amount = _depositToken.underlying().balanceOf(address(treasury)) - _balanceBefore;

        uint256 _amountToDeposit = _amount;
        uint256 _feeAmount;
        if (depositFee > 0) {
            _feeAmount = _amount.wadMul(depositFee);
            _depositToken.mint(address(treasury), _feeAmount);
            _amountToDeposit -= _feeAmount;
        }

        _depositToken.mint(_onBehalfOf, _amountToDeposit);

        emit CollateralDeposited(_depositToken, _sender, _onBehalfOf, _amount, _feeAmount);
    }

    /**
     * @notice Burn vSynth-Collateral and withdraw collateral
     * @param _amount The amount of collateral to withdraw
     * @param _to The account that will receive withdrawn collateral
     */
    function withdraw(
        IDepositToken _depositToken,
        uint256 _amount,
        address _to
    ) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");
        onlyIfDepositTokenExists(_depositToken);

        address _account = _msgSender();

        (, , , uint256 _unlockedDepositInUsd) = debtPositionOf(_account);

        uint256 _unlockedDeposit = oracle.convertFromUsd(_depositToken.underlying(), _unlockedDepositInUsd);

        if (_amount == type(uint256).max) {
            _amount = _unlockedDeposit;
        } else {
            require(_amount <= _unlockedDeposit, "amount-gt-unlocked");
        }

        uint256 _amountToWithdraw = _amount;
        uint256 _feeAmount;
        if (withdrawFee > 0) {
            _feeAmount = _amount.wadMul(withdrawFee);
            _depositToken.seize(_account, address(treasury), _feeAmount);
            _amountToWithdraw -= _feeAmount;
        }

        _depositToken.burnForWithdraw(_account, _amountToWithdraw);
        treasury.pull(_depositToken.underlying(), _to, _amountToWithdraw);

        emit CollateralWithdrawn(_depositToken, _account, _to, _amount, _feeAmount);
    }

    /**
     * @notice Lock collateral and mint synthetic asset
     * @param _syntheticAsset The synthetic asset to mint
     * @param _amount The amount to mint
     */
    function mint(
        ISyntheticAsset _syntheticAsset,
        uint256 _amount,
        address _to
    ) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");
        onlyIfSyntheticAssetExists(_syntheticAsset);
        onlyIfSyntheticAssetIsActive(_syntheticAsset);

        address _account = _msgSender();

        accrueInterest(_syntheticAsset);

        if (_amount == type(uint256).max) {
            _amount = maxIssuableFor(_account, _syntheticAsset);
        } else {
            require(_amount <= maxIssuableFor(_account, _syntheticAsset), "not-enough-collateral");
        }

        if (debtFloorInUsd > 0) {
            require(
                oracle.convertToUsd(_syntheticAsset, _syntheticAsset.debtToken().balanceOf(_account) + _amount) >=
                    debtFloorInUsd,
                "debt-lt-floor"
            );
        }

        uint256 _amountToMint = _amount;
        uint256 _feeAmount;
        if (mintFee > 0) {
            _feeAmount = _amount.wadMul(mintFee);
            _syntheticAsset.mint(address(treasury), _feeAmount);
            _amountToMint -= _feeAmount;
        }

        _syntheticAsset.mint(_to, _amountToMint);
        _syntheticAsset.debtToken().mint(_account, _amount);

        emit SyntheticAssetMinted(_account, _to, _syntheticAsset, _amount, _feeAmount);
    }

    /**
     * @notice Send synthetic asset to decrease debt
     * @dev The msg.sender is the payer and the account beneficied
     * @param _syntheticAsset The synthetic asset to burn
     * @param _onBehalfOf The account that will have debt decreased
     * @param _amount The amount of synthetic asset to burn
     */
    function repay(
        ISyntheticAsset _syntheticAsset,
        address _onBehalfOf,
        uint256 _amount
    ) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");

        accrueInterest(_syntheticAsset);

        address _payer = _msgSender();

        if (_amount == type(uint256).max) {
            uint256 _debtPlusFee = _syntheticAsset.debtToken().balanceOf(_onBehalfOf).wadDiv(1e18 - repayFee);
            _amount = Math.min(_syntheticAsset.balanceOf(_payer), _debtPlusFee);
        }

        uint256 _amountToRepay = _amount;
        uint256 _feeAmount;
        if (repayFee > 0) {
            _feeAmount = _amount.wadMul(repayFee);
            _syntheticAsset.seize(_payer, address(treasury), _feeAmount);
            _amountToRepay -= _feeAmount;
        }

        if (debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = oracle.convertToUsd(
                _syntheticAsset,
                _syntheticAsset.debtToken().balanceOf(_onBehalfOf) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= debtFloorInUsd, "debt-lt-floor");
        }

        _syntheticAsset.burn(_payer, _amountToRepay);
        _syntheticAsset.debtToken().burn(_onBehalfOf, _amountToRepay);

        emit DebtRepayed(_onBehalfOf, _syntheticAsset, _amount, _feeAmount);
    }

    /**
     * @notice Burn synthetic asset, unlock deposit token and send liquidator fee
     * @param _syntheticAsset The vsAsset to use for repayment
     * @param _account The account with an unhealty position
     * @param _amountToRepay The amount to repay in synthetic asset
     * @param _depositToken The collateral to seize from
     */
    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay,
        IDepositToken _depositToken
    ) external override whenNotShutdown nonReentrant {
        require(_amountToRepay > 0, "amount-is-zero");
        onlyIfDepositTokenExists(_depositToken);

        address _liquidator = _msgSender();
        require(_liquidator != _account, "can-not-liquidate-own-position");

        accrueInterest(_syntheticAsset);

        if (_amountToRepay == type(uint256).max) {
            _amountToRepay = Math.min(
                _syntheticAsset.balanceOf(_liquidator),
                _syntheticAsset.debtToken().balanceOf(_account).wadMul(maxLiquidable)
            );
        }

        require(
            _amountToRepay.wadDiv(_syntheticAsset.debtToken().balanceOf(_account)) <= maxLiquidable,
            "amount-gt-max-liquidable"
        );

        if (debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = oracle.convertToUsd(
                _syntheticAsset,
                _syntheticAsset.debtToken().balanceOf(_account) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= debtFloorInUsd, "debt-lt-floor");
        }

        (bool _isHealthy, , , ) = debtPositionOf(_account);

        require(!_isHealthy, "position-is-healthy");

        uint256 _amountToRepayInCollateral = oracle.convert(
            _syntheticAsset,
            _depositToken.underlying(),
            _amountToRepay
        );

        uint256 _toProtocol = liquidateFee > 0 ? _amountToRepayInCollateral.wadMul(liquidateFee) : 0;
        uint256 _toLiquidator = _amountToRepayInCollateral.wadMul(1e18 + liquidatorFee);
        uint256 _depositToSeize = _toProtocol + _toLiquidator;

        require(_depositToSeize <= _depositToken.balanceOf(_account), "amount-too-high");

        _syntheticAsset.burn(_liquidator, _amountToRepay);
        _syntheticAsset.debtToken().burn(_account, _amountToRepay);
        _depositToken.seize(_account, _liquidator, _toLiquidator);

        if (_toProtocol > 0) {
            _depositToken.seize(_account, address(treasury), _toProtocol);
        }

        emit PositionLiquidated(_liquidator, _account, _syntheticAsset, _amountToRepay, _depositToSeize, _toProtocol);
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
        onlyIfSyntheticAssetExists(_syntheticAssetIn);
        onlyIfSyntheticAssetExists(_syntheticAssetOut);
        onlyIfSyntheticAssetIsActive(_syntheticAssetOut);

        accrueInterest(_syntheticAssetIn);
        accrueInterest(_syntheticAssetOut);

        address _account = _msgSender();

        if (_amountIn == type(uint256).max) {
            _amountIn = _syntheticAssetIn.balanceOf(_account);
        } else {
            require(_amountIn > 0 && _amountIn <= _syntheticAssetIn.balanceOf(_account), "amount-in-0-or-gt-balance");
        }

        (bool _isHealthy, , , ) = debtPositionOf(_account);
        require(_isHealthy, "position-is-unhealthy");

        uint256 _amountOutBeforeFee = oracle.convert(_syntheticAssetIn, _syntheticAssetOut, _amountIn);

        if (debtFloorInUsd > 0) {
            uint256 _inNewDebtInUsd = oracle.convertToUsd(
                _syntheticAssetIn,
                _syntheticAssetIn.debtToken().balanceOf(_account) - _amountIn
            );
            require(_inNewDebtInUsd == 0 || _inNewDebtInUsd >= debtFloorInUsd, "asset-in-debt-lt-floor");

            require(
                oracle.convertToUsd(
                    _syntheticAssetOut,
                    _syntheticAssetOut.debtToken().balanceOf(_account) + _amountOutBeforeFee
                ) >= debtFloorInUsd,
                "asset-out-debt-lt-floor"
            );
        }

        _syntheticAssetIn.burn(_account, _amountIn);
        _syntheticAssetIn.debtToken().burn(_account, _amountIn);

        _amountOut = _amountOutBeforeFee;
        uint256 _feeAmount;
        if (swapFee > 0) {
            _feeAmount = _amountOutBeforeFee.wadMul(swapFee);
            _syntheticAssetOut.mint(address(treasury), _feeAmount);
            _amountOut -= _feeAmount;
        }

        _syntheticAssetOut.mint(_account, _amountOut);
        _syntheticAssetOut.debtToken().mint(_account, _amountOutBeforeFee);

        (bool _isHealthyAfter, , , ) = debtPositionOf(_account);
        require(_isHealthyAfter, "position-ended-up-unhealthy");

        emit SyntheticAssetSwapped(_account, _syntheticAssetIn, _syntheticAssetOut, _amountIn, _amountOut, _feeAmount);
    }

    /**
     * @notice Add synthetic token to vSynth offerings
     */
    function addSyntheticAsset(address _syntheticAsset) public override onlyGovernor {
        require(_syntheticAsset != address(0), "address-is-null");
        require(!syntheticAssets.contains(_syntheticAsset), "asset-exists");

        syntheticAssets.add(_syntheticAsset);

        emit SyntheticAssetAdded(_syntheticAsset);
    }

    /**
     * @notice Remove synthetic token from vSynth offerings
     */
    function removeSyntheticAsset(ISyntheticAsset _syntheticAsset) external override onlyGovernor {
        onlyIfSyntheticAssetExists(_syntheticAsset);
        require(_syntheticAsset.totalSupply() == 0, "supply-gt-0");
        require(_syntheticAsset.debtToken().totalSupply() == 0, "asset-with-debt-supply");

        syntheticAssets.remove(address(_syntheticAsset));

        emit SyntheticAssetRemoved(_syntheticAsset);
    }

    /**
     * @notice Add deposit token (i.e. collateral) to vSynth
     */
    function addDepositToken(address _depositToken) public override onlyGovernor {
        require(_depositToken != address(0), "address-is-null");
        require(!depositTokens.contains(_depositToken), "deposit-token-exists");

        depositTokens.add(_depositToken);
        depositTokenOf[IDepositToken(_depositToken).underlying()] = IDepositToken(_depositToken);

        emit DepositTokenAdded(_depositToken);
    }

    /**
     * @notice Remove deposit token (i.e. collateral) from vSynth
     */
    function removeDepositToken(IDepositToken _depositToken) external override onlyGovernor {
        onlyIfDepositTokenExists(_depositToken);
        require(_depositToken.totalSupply() == 0, "supply-gt-0");

        delete depositTokenOf[_depositToken.underlying()];
        depositTokens.remove(address(_depositToken));

        emit DepositTokenRemoved(_depositToken);
    }

    /**
     * @notice Update price oracle contract
     */
    function updateOracle(IOracle _newOracle) external override onlyGovernor {
        require(address(_newOracle) != address(0), "address-is-null");
        require(_newOracle != oracle, "new-is-same-as-current");

        emit OracleUpdated(oracle, _newOracle);
        oracle = _newOracle;
    }

    /**
     * @notice Update deposit fee
     */
    function updateDepositFee(uint256 _newDepositFee) external override onlyGovernor {
        require(_newDepositFee <= 1e18, "max-is-100%");
        emit DepositFeeUpdated(depositFee, _newDepositFee);
        depositFee = _newDepositFee;
    }

    /**
     * @notice Update mint fee
     */
    function updateMintFee(uint256 _newMintFee) external override onlyGovernor {
        require(_newMintFee <= 1e18, "max-is-100%");
        emit MintFeeUpdated(mintFee, _newMintFee);
        mintFee = _newMintFee;
    }

    /**
     * @notice Update withdraw fee
     */
    function updateWithdrawFee(uint256 _newWithdrawFee) external override onlyGovernor {
        require(_newWithdrawFee <= 1e18, "max-is-100%");
        emit WithdrawFeeUpdated(withdrawFee, _newWithdrawFee);
        withdrawFee = _newWithdrawFee;
    }

    /**
     * @notice Update repay fee
     */
    function updateRepayFee(uint256 _newRepayFee) external override onlyGovernor {
        require(_newRepayFee <= 1e18, "max-is-100%");
        emit RepayFeeUpdated(repayFee, _newRepayFee);
        repayFee = _newRepayFee;
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(uint256 _newSwapFee) external override onlyGovernor {
        require(_newSwapFee <= 1e18, "max-is-100%");
        emit SwapFeeUpdated(swapFee, _newSwapFee);
        swapFee = _newSwapFee;
    }

    /**
     * @notice Update liquidator fee
     */
    function updateLiquidatorFee(uint256 _newLiquidatorFee) external override onlyGovernor {
        require(_newLiquidatorFee <= 1e18, "max-is-100%");
        emit LiquidatorFeeUpdated(liquidatorFee, _newLiquidatorFee);
        liquidatorFee = _newLiquidatorFee;
    }

    /**
     * @notice Update liquidate fee
     */
    function updateLiquidateFee(uint256 _newLiquidateFee) external override onlyGovernor {
        require(_newLiquidateFee <= 1e18, "max-is-100%");
        emit LiquidateFeeUpdated(liquidateFee, _newLiquidateFee);
        liquidateFee = _newLiquidateFee;
    }

    /**
     * @notice Update maxLiquidable (liquidation cap)
     */
    function updateMaxLiquidable(uint256 _newMaxLiquidable) external override onlyGovernor {
        require(_newMaxLiquidable != maxLiquidable, "new-is-same-as-current");
        require(_newMaxLiquidable <= 1e18, "max-is-100%");
        emit MaxLiquidableUpdated(maxLiquidable, _newMaxLiquidable);
        maxLiquidable = _newMaxLiquidable;
    }

    /**
     * @notice Update debt floor
     */
    function updateDebtFloor(uint256 _newDebtFloorInUsd) external override onlyGovernor {
        emit DebtFloorUpdated(debtFloorInUsd, _newDebtFloorInUsd);
        debtFloorInUsd = _newDebtFloorInUsd;
    }

    /**
     * @notice Update treasury contract - will migrate funds to the new contract
     */
    function updateTreasury(ITreasury _newTreasury, bool _withMigration) external override onlyGovernor {
        require(address(_newTreasury) != address(0), "address-is-null");
        require(_newTreasury != treasury, "new-same-as-current");

        if (_withMigration) treasury.migrateTo(address(_newTreasury));

        emit TreasuryUpdated(treasury, _newTreasury);
        treasury = _newTreasury;
    }
}
