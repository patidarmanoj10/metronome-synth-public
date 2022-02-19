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
    using MappedEnumerableSet for MappedEnumerableSet.AddressSet;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when synthetic token is enabled
    event SyntheticTokenAdded(address indexed syntheticToken);

    /// @notice Emitted when synthetic token is disabled
    event SyntheticTokenRemoved(ISyntheticToken indexed syntheticToken);

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

    /// @notice Emitted when synthetic token is issued
    event SyntheticTokenIssued(
        address indexed account,
        address indexed to,
        ISyntheticToken indexed syntheticToken,
        uint256 amount,
        uint256 fee
    );

    /// @notice Emitted when synthetic's debt is repayed
    event DebtRepayed(address indexed account, ISyntheticToken indexed syntheticToken, uint256 amount, uint256 fee);

    /// @notice Emitted when a position is liquidated
    event PositionLiquidated(
        address indexed liquidator,
        address indexed account,
        ISyntheticToken indexed syntheticToken,
        uint256 amountRepayed,
        uint256 depositSeized,
        uint256 fee
    );

    /// @notice Emitted when synthetic token is swapped
    event SyntheticTokenSwapped(
        address indexed account,
        ISyntheticToken indexed syntheticTokenIn,
        ISyntheticToken indexed syntheticTokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    /// @notice Emitted when debt is refinancied
    event DebtRefinancied(
        address indexed account,
        ISyntheticToken syntheticToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    /// @notice Emitted when protocol liquidation fee is updated
    event DebtFloorUpdated(uint256 oldDebtFloorInUsd, uint256 newDebtFloorInUsd);

    /// @notice Emitted when deposit fee is updated
    event DepositFeeUpdated(uint256 oldDepositFee, uint256 newDepositFee);

    /// @notice Emitted when issue fee is updated
    event IssueFeeUpdated(uint256 oldIssueFee, uint256 newIssueFee);

    /// @notice Emitted when withdraw fee is updated
    event WithdrawFeeUpdated(uint256 oldWithdrawFee, uint256 newWithdrawFee);

    /// @notice Emitted when repay fee is updated
    event RepayFeeUpdated(uint256 oldRepayFee, uint256 newRepayFee);

    /// @notice Emitted when swap fee is updated
    event SwapFeeUpdated(uint256 oldSwapFee, uint256 newSwapFee);

    /// @notice Emitted when refinance fee is updated
    event RefinanceFeeUpdated(uint256 oldRefinanceFee, uint256 newRefinanceFee);

    /// @notice Emitted when liquidator liquidation fee is updated
    event LiquidatorLiquidationFeeUpdated(uint256 oldLiquidatorLiquidationFee, uint256 newLiquidatorLiquidationFee);

    /// @notice Emitted when maxLiquidable (liquidation cap) is updated
    event MaxLiquidableUpdated(uint256 oldMaxLiquidable, uint256 newMaxLiquidable);

    /// @notice Emitted when protocol liquidation fee is updated
    event ProtocolLiquidationFeeUpdated(uint256 oldProtocolLiquidationFee, uint256 newProtocolLiquidationFee);

    /// @notice Emitted when oracle contract is updated
    event OracleUpdated(IMasterOracle indexed oldOracle, IMasterOracle indexed newOracle);

    /// @notice Emitted when treasury contract is updated
    event TreasuryUpdated(ITreasury indexed oldTreasury, ITreasury indexed newTreasury);

    function initialize(IMasterOracle _oracle, ITreasury _treasury) public initializer {
        require(address(_treasury) != address(0), "treasury-is-null");
        require(address(_oracle) != address(0), "oracle-is-null");

        __ReentrancyGuard_init();
        __Governable_init();

        oracle = _oracle;
        treasury = _treasury;

        repayFee = 3e15; // 0.3%
        swapFee = 6e15; // 0.6%
        liquidatorLiquidationFee = 1e17; // 10%
        protocolLiquidationFee = 8e16; // 8%
        maxLiquidable = 1e18; // 100%
    }

    /**
     * @dev Throws if synthetic token doesn't exist
     */
    function _requireSyntheticTokenExists(ISyntheticToken _syntheticToken) private view {
        require(isSyntheticTokenExists(_syntheticToken), "synthetic-inexistent");
    }

    /**
     * @dev Throws if synthetic token isn't enabled
     */
    function _requireSyntheticTokenIsActive(ISyntheticToken _syntheticToken) private view {
        require(_syntheticToken.isActive(), "synthetic-inactive");
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    function _requireDepositTokenExists(IDepositToken _depositToken) private view {
        require(isDepositTokenExists(_depositToken), "collateral-inexistent");
    }

    /**
     * @dev Throws if collateral asset isn't enabled
     */
    function _requireDepositTokenIsActive(IDepositToken _depositToken) private view {
        require(_depositToken.isActive(), "collateral-inactive");
    }

    /**
     * @dev Throws if `msg.sender` isn't a debt token
     */
    function _requireMsgSenderIsDebtToken() private view {
        IDebtToken _debtToken = IDebtToken(_msgSender());
        ISyntheticToken _syntheticToken = _debtToken.syntheticToken();
        require(
            syntheticTokens.contains(address(_syntheticToken)) && _msgSender() == address(_syntheticToken.debtToken()),
            "caller-is-not-debt-token"
        );
    }

    /**
     * @notice Get all synthetic tokens
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getSyntheticTokens() external view override returns (address[] memory) {
        return syntheticTokens.values();
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
     * @notice Get deposit tokens of an account
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getDepositTokensOfAccount(address _account) external view override returns (address[] memory) {
        return depositTokensOfAccount.values(_account);
    }

    /**
     * @notice Get all deposit tokens
     * @dev WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees.
     */
    function getDebtTokensOfAccount(address _account) external view override returns (address[] memory) {
        return debtTokensOfAccount.values(_account);
    }

    /**
     * @notice Check if token is part of the synthetic offerings
     * @param _syntheticToken Asset to check
     * @return true if exist
     */
    function isSyntheticTokenExists(ISyntheticToken _syntheticToken) public view override returns (bool) {
        return syntheticTokens.contains(address(_syntheticToken));
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
     * @param _account The account to check
     * @return _debtInUsd The debt value in USD
     */
    function debtOf(address _account) public view override returns (uint256 _debtInUsd) {
        for (uint256 i = 0; i < debtTokensOfAccount.length(_account); ++i) {
            IDebtToken _debtToken = IDebtToken(debtTokensOfAccount.at(_account, i));
            ISyntheticToken _syntheticToken = _debtToken.syntheticToken();
            uint256 _amountInUsd = oracle.convertToUsd(_syntheticToken, _debtToken.balanceOf(_account));
            _debtInUsd += _amountInUsd;
        }
    }

    /**
     * @notice Get account's total collateral deposited by querying latest prices from oracles
     * @param _account The account to check
     * @return _depositInUsd The total deposit value in USD among all collaterals
     * @return _issuableLimitInUsd The max value in USD that can be used to issue synthetic tokens
     */
    function depositOf(address _account)
        public
        view
        override
        returns (uint256 _depositInUsd, uint256 _issuableLimitInUsd)
    {
        for (uint256 i = 0; i < depositTokensOfAccount.length(_account); ++i) {
            IDepositToken _depositToken = IDepositToken(depositTokensOfAccount.at(_account, i));
            uint256 _amountInUsd = oracle.convertToUsd(_depositToken, _depositToken.balanceOf(_account));
            _depositInUsd += _amountInUsd;
            _issuableLimitInUsd += _amountInUsd.wadMul(_depositToken.collateralizationRatio());
        }
    }

    /**
     * @notice Get if the debt position from an account is healthy
     * @param _account The account to check
     * @return _isHealthy Whether the account's position is healthy
     * @return _depositInUsd The total collateral deposited in USD
     * @return _debtInUsd The total debt in USD
     * @return _issuableLimitInUsd The max amount of debt (is USD) that can be created (considering collateralization ratios)
     * @return _issuableInUsd The amount of debt (is USD) that is free (i.e. can be used to issue synthetic tokens)
     */
    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _depositInUsd,
            uint256 _debtInUsd,
            uint256 _issuableLimitInUsd,
            uint256 _issuableInUsd
        )
    {
        _debtInUsd = debtOf(_account);
        (_depositInUsd, _issuableLimitInUsd) = depositOf(_account);
        _isHealthy = _debtInUsd <= _issuableLimitInUsd;
        _issuableInUsd = _debtInUsd < _issuableLimitInUsd ? _issuableLimitInUsd - _debtInUsd : 0;
    }

    /**
     * @notice Deposit colleteral and mint vsCollateral-Deposit (tokenized deposit position)
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
        _requireDepositTokenExists(_depositToken);
        _requireDepositTokenIsActive(_depositToken);

        address _sender = _msgSender();

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
     * @notice Burn vsCollateral-Deposit and withdraw collateral
     * @param _amount The amount of collateral to withdraw
     * @param _to The account that will receive withdrawn collateral
     */
    function withdraw(
        IDepositToken _depositToken,
        uint256 _amount,
        address _to
    ) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");
        _requireDepositTokenExists(_depositToken);

        address _account = _msgSender();

        require(_amount <= _depositToken.unlockedBalanceOf(_account), "amount-gt-unlocked");

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
     * @notice Lock collateral and mint synthetic token
     * @param _syntheticToken The synthetic token to issue
     * @param _amount The amount to mint
     */
    function issue(
        ISyntheticToken _syntheticToken,
        uint256 _amount,
        address _to
    ) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");
        _requireSyntheticTokenExists(_syntheticToken);
        _requireSyntheticTokenIsActive(_syntheticToken);

        address _account = _msgSender();

        _syntheticToken.accrueInterest();

        (, , , , uint256 _issuableInUsd) = debtPositionOf(_account);

        require(_amount <= oracle.convertFromUsd(_syntheticToken, _issuableInUsd), "not-enough-collateral");

        if (debtFloorInUsd > 0) {
            require(
                oracle.convertToUsd(_syntheticToken, _syntheticToken.debtToken().balanceOf(_account) + _amount) >=
                    debtFloorInUsd,
                "debt-lt-floor"
            );
        }

        uint256 _amountToIssue = _amount;
        uint256 _feeAmount;
        if (issueFee > 0) {
            _feeAmount = _amount.wadMul(issueFee);
            _syntheticToken.mint(address(treasury), _feeAmount);
            _amountToIssue -= _feeAmount;
        }

        _syntheticToken.mint(_to, _amountToIssue);
        _syntheticToken.debtToken().mint(_account, _amount);

        emit SyntheticTokenIssued(_account, _to, _syntheticToken, _amount, _feeAmount);
    }

    /**
     * @notice Send synthetic token to decrease debt
     * @dev The msg.sender is the payer and the account beneficied
     * @param _syntheticToken The synthetic token to burn
     * @param _onBehalfOf The account that will have debt decreased
     * @param _amount The amount of synthetic token to burn
     */
    function repay(
        ISyntheticToken _syntheticToken,
        address _onBehalfOf,
        uint256 _amount
    ) external override whenNotShutdown nonReentrant {
        require(_amount > 0, "amount-is-zero");

        _syntheticToken.accrueInterest();

        address _payer = _msgSender();

        uint256 _amountToRepay = _amount;
        uint256 _feeAmount;
        if (repayFee > 0) {
            _feeAmount = _amount.wadMul(repayFee);
            _syntheticToken.seize(_payer, address(treasury), _feeAmount);
            _amountToRepay -= _feeAmount;
        }

        if (debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = oracle.convertToUsd(
                _syntheticToken,
                _syntheticToken.debtToken().balanceOf(_onBehalfOf) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= debtFloorInUsd, "debt-lt-floor");
        }

        _syntheticToken.burn(_payer, _amountToRepay);
        _syntheticToken.debtToken().burn(_onBehalfOf, _amountToRepay);

        emit DebtRepayed(_onBehalfOf, _syntheticToken, _amount, _feeAmount);
    }

    /**
     * @notice Burn synthetic token, unlock deposit token and send liquidator liquidation fee
     * @param _syntheticToken The vsAsset to use for repayment
     * @param _account The account with an unhealty position
     * @param _amountToRepay The amount to repay in synthetic token
     * @param _depositToken The collateral to seize from
     */
    function liquidate(
        ISyntheticToken _syntheticToken,
        address _account,
        uint256 _amountToRepay,
        IDepositToken _depositToken
    ) external override whenNotShutdown nonReentrant {
        require(_amountToRepay > 0, "amount-is-zero");
        _requireDepositTokenExists(_depositToken);

        address _liquidator = _msgSender();
        require(_liquidator != _account, "can-not-liquidate-own-position");

        _syntheticToken.accrueInterest();

        require(
            _amountToRepay.wadDiv(_syntheticToken.debtToken().balanceOf(_account)) <= maxLiquidable,
            "amount-gt-max-liquidable"
        );

        if (debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = oracle.convertToUsd(
                _syntheticToken,
                _syntheticToken.debtToken().balanceOf(_account) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= debtFloorInUsd, "debt-lt-floor");
        }

        (bool _isHealthy, , , , ) = debtPositionOf(_account);

        require(!_isHealthy, "position-is-healthy");

        uint256 _amountToRepayInCollateral = oracle.convert(_syntheticToken, _depositToken, _amountToRepay);

        uint256 _toProtocol = protocolLiquidationFee > 0
            ? _amountToRepayInCollateral.wadMul(protocolLiquidationFee)
            : 0;
        uint256 _toLiquidator = _amountToRepayInCollateral.wadMul(1e18 + liquidatorLiquidationFee);
        uint256 _depositToSeize = _toProtocol + _toLiquidator;

        require(_depositToSeize <= _depositToken.balanceOf(_account), "amount-too-high");

        _syntheticToken.burn(_liquidator, _amountToRepay);
        _syntheticToken.debtToken().burn(_account, _amountToRepay);
        _depositToken.seize(_account, _liquidator, _toLiquidator);

        if (_toProtocol > 0) {
            _depositToken.seize(_account, address(treasury), _toProtocol);
        }

        emit PositionLiquidated(_liquidator, _account, _syntheticToken, _amountToRepay, _depositToSeize, _toProtocol);
    }

    /**
     * @notice Swap synthetic tokens
     * @param _syntheticTokenIn Synthetic token to sell
     * @param _syntheticTokenOut Synthetic token to buy
     * @param _amountIn Amount to swap
     */
    function swap(
        ISyntheticToken _syntheticTokenIn,
        ISyntheticToken _syntheticTokenOut,
        uint256 _amountIn
    ) external override whenNotShutdown nonReentrant returns (uint256 _amountOut) {
        _requireSyntheticTokenExists(_syntheticTokenIn);
        _requireSyntheticTokenExists(_syntheticTokenOut);
        _requireSyntheticTokenIsActive(_syntheticTokenOut);

        _syntheticTokenIn.accrueInterest();
        _syntheticTokenOut.accrueInterest();

        address _account = _msgSender();

        require(_amountIn > 0 && _amountIn <= _syntheticTokenIn.balanceOf(_account), "amount-in-0-or-gt-balance");

        uint256 _amountOutBeforeFee = oracle.convert(_syntheticTokenIn, _syntheticTokenOut, _amountIn);

        if (debtFloorInUsd > 0) {
            uint256 _inNewDebtInUsd = oracle.convertToUsd(
                _syntheticTokenIn,
                _syntheticTokenIn.debtToken().balanceOf(_account) - _amountIn
            );
            require(_inNewDebtInUsd == 0 || _inNewDebtInUsd >= debtFloorInUsd, "synthetic-in-debt-lt-floor");

            require(
                oracle.convertToUsd(
                    _syntheticTokenOut,
                    _syntheticTokenOut.debtToken().balanceOf(_account) + _amountOutBeforeFee
                ) >= debtFloorInUsd,
                "synthetic-out-debt-lt-floor"
            );
        }

        _syntheticTokenIn.burn(_account, _amountIn);
        _syntheticTokenIn.debtToken().burn(_account, _amountIn);

        _amountOut = _amountOutBeforeFee;
        uint256 _feeAmount;
        if (swapFee > 0) {
            _feeAmount = _amountOutBeforeFee.wadMul(swapFee);
            _syntheticTokenOut.mint(address(treasury), _feeAmount);
            _amountOut -= _feeAmount;
        }

        _syntheticTokenOut.mint(_account, _amountOut);
        _syntheticTokenOut.debtToken().mint(_account, _amountOutBeforeFee);

        emit SyntheticTokenSwapped(_account, _syntheticTokenIn, _syntheticTokenOut, _amountIn, _amountOut, _feeAmount);
    }

    /**
     * @notice Add synthetic token to vSynth offerings
     */
    function addSyntheticToken(address _syntheticToken) public override onlyGovernor {
        require(_syntheticToken != address(0), "address-is-null");
        require(!syntheticTokens.contains(_syntheticToken), "synthetic-exists");

        syntheticTokens.add(_syntheticToken);

        emit SyntheticTokenAdded(_syntheticToken);
    }

    /**
     * @notice Remove synthetic token from vSynth offerings
     */
    function removeSyntheticToken(ISyntheticToken _syntheticToken) external override onlyGovernor {
        _requireSyntheticTokenExists(_syntheticToken);
        require(_syntheticToken.totalSupply() == 0, "supply-gt-0");
        require(_syntheticToken.debtToken().totalSupply() == 0, "synthetic-with-debt-supply");

        syntheticTokens.remove(address(_syntheticToken));

        emit SyntheticTokenRemoved(_syntheticToken);
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
        _requireDepositTokenExists(_depositToken);
        require(_depositToken.totalSupply() == 0, "supply-gt-0");

        delete depositTokenOf[_depositToken.underlying()];
        depositTokens.remove(address(_depositToken));

        emit DepositTokenRemoved(_depositToken);
    }

    /**
     * @notice Add a deposit token to the per-account list
     * @dev This function is called from `DepositToken._beforeTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function addToDepositTokensOfAccount(address _account) external {
        require(depositTokens.contains(_msgSender()), "caller-is-not-deposit-token");
        depositTokensOfAccount.add(_account, _msgSender());
    }

    /**
     * @notice Remove a deposit token from the per-account list
     * @dev This function is called from `DepositToken._afterTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function removeFromDepositTokensOfAccount(address _account) external {
        require(depositTokens.contains(_msgSender()), "caller-is-not-deposit-token");
        depositTokensOfAccount.remove(_account, _msgSender());
    }

    /**
     * @notice Add a debt token to the per-account list
     * @dev This function is called from `DebtToken._beforeTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function addToDebtTokensOfAccount(address _account) external {
        _requireMsgSenderIsDebtToken();
        debtTokensOfAccount.add(_account, _msgSender());
    }

    /**
     * @notice Remove a debt token from the per-account list
     * @dev This function is called from `DebtToken._afterTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function removeFromDebtTokensOfAccount(address _account) external {
        _requireMsgSenderIsDebtToken();
        debtTokensOfAccount.remove(_account, _msgSender());
    }

    /**
     * @notice Update price oracle contract
     */
    function updateOracle(IMasterOracle _newOracle) external override onlyGovernor {
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
     * @notice Update issue fee
     */
    function updateIssueFee(uint256 _newIssueFee) external override onlyGovernor {
        require(_newIssueFee <= 1e18, "max-is-100%");
        emit IssueFeeUpdated(issueFee, _newIssueFee);
        issueFee = _newIssueFee;
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
     * @notice Update liquidator liquidation fee
     */
    function updateLiquidatorLiquidationFee(uint256 _newLiquidatorLiquidationFee) external override onlyGovernor {
        require(_newLiquidatorLiquidationFee <= 1e18, "max-is-100%");
        emit LiquidatorLiquidationFeeUpdated(liquidatorLiquidationFee, _newLiquidatorLiquidationFee);
        liquidatorLiquidationFee = _newLiquidatorLiquidationFee;
    }

    /**
     * @notice Update protocol liquidation fee
     */
    function updateProtocolLiquidationFee(uint256 _newProtocolLiquidationFee) external override onlyGovernor {
        require(_newProtocolLiquidationFee <= 1e18, "max-is-100%");
        emit ProtocolLiquidationFeeUpdated(protocolLiquidationFee, _newProtocolLiquidationFee);
        protocolLiquidationFee = _newProtocolLiquidationFee;
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
