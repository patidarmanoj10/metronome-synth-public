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

    /// @notice Emitted when master oracle contract is updated
    event MasterOracleUpdated(IMasterOracle indexed oldOracle, IMasterOracle indexed newOracle);

    /// @notice Emitted when treasury contract is updated
    event TreasuryUpdated(ITreasury indexed oldTreasury, ITreasury indexed newTreasury);

    /// @notice Emitted when rewards distributor contract is added
    event RewardsDistributorAdded(IRewardsDistributor _distributor);

    /**
     * @dev Throws if synthetic token doesn't exist
     */
    modifier onlyIfSyntheticTokenExists(ISyntheticToken _syntheticToken) {
        require(isSyntheticTokenExists(_syntheticToken), "synthetic-inexistent");
        _;
    }

    /**
     * @dev Throws if synthetic token isn't enabled
     */
    modifier onlyIfSyntheticTokenIsActive(ISyntheticToken _syntheticToken) {
        require(_syntheticToken.isActive(), "synthetic-inactive");
        _;
    }

    /**
     * @dev Throws if deposit token doesn't exist
     */
    modifier onlyIfDepositTokenExists(IDepositToken _depositToken) {
        require(isDepositTokenExists(_depositToken), "collateral-inexistent");
        _;
    }

    /**
     * @dev Throws if `msg.sender` isn't a debt token
     */
    modifier onlyIfMsgSenderIsDebtToken() {
        IDebtToken _debtToken = IDebtToken(_msgSender());
        ISyntheticToken _syntheticToken = _debtToken.syntheticToken();
        require(
            syntheticTokens.contains(address(_syntheticToken)) && _msgSender() == address(_syntheticToken.debtToken()),
            "caller-is-not-debt-token"
        );
        _;
    }

    function initialize(IMasterOracle _masterOracle, ITreasury _treasury) public initializer {
        require(address(_treasury) != address(0), "treasury-is-null");
        require(address(_masterOracle) != address(0), "oracle-is-null");

        __ReentrancyGuard_init();
        __Governable_init();

        masterOracle = _masterOracle;
        treasury = _treasury;

        repayFee = 3e15; // 0.3%
        swapFee = 6e15; // 0.6%
        liquidatorLiquidationFee = 1e17; // 10%
        protocolLiquidationFee = 8e16; // 8%
        maxLiquidable = 1e18; // 100%
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
     * @notice Get all rewards distributors
     */
    function getRewardsDistributors() external view override returns (IRewardsDistributor[] memory) {
        return rewardsDistributors;
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
        uint256 _length = debtTokensOfAccount.length(_account);
        for (uint256 i = 0; i < _length; ++i) {
            IDebtToken _debtToken = IDebtToken(debtTokensOfAccount.at(_account, i));
            ISyntheticToken _syntheticToken = _debtToken.syntheticToken();
            uint256 _amountInUsd = masterOracle.convertToUsd(_syntheticToken, _debtToken.balanceOf(_account));
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
        uint256 _length = depositTokensOfAccount.length(_account);
        for (uint256 i = 0; i < _length; ++i) {
            IDepositToken _depositToken = IDepositToken(depositTokensOfAccount.at(_account, i));
            uint256 _amountInUsd = masterOracle.convertToUsd(_depositToken, _depositToken.balanceOf(_account));
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
    ) external override whenNotShutdown nonReentrant onlyIfDepositTokenExists(_depositToken) {
        require(_amountToRepay > 0, "amount-is-zero");

        address _liquidator = _msgSender();
        require(_liquidator != _account, "can-not-liquidate-own-position");

        _syntheticToken.accrueInterest();

        require(
            _amountToRepay.wadDiv(_syntheticToken.debtToken().balanceOf(_account)) <= maxLiquidable,
            "amount-gt-max-liquidable"
        );

        if (debtFloorInUsd > 0) {
            uint256 _newDebtInUsd = masterOracle.convertToUsd(
                _syntheticToken,
                _syntheticToken.debtToken().balanceOf(_account) - _amountToRepay
            );
            require(_newDebtInUsd == 0 || _newDebtInUsd >= debtFloorInUsd, "debt-lt-floor");
        }

        (bool _isHealthy, , , , ) = debtPositionOf(_account);

        require(!_isHealthy, "position-is-healthy");

        uint256 _amountToRepayInCollateral = masterOracle.convert(_syntheticToken, _depositToken, _amountToRepay);

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
    )
        external
        override
        whenNotShutdown
        nonReentrant
        onlyIfSyntheticTokenExists(_syntheticTokenIn)
        onlyIfSyntheticTokenExists(_syntheticTokenOut)
        onlyIfSyntheticTokenIsActive(_syntheticTokenOut)
        returns (uint256 _amountOut)
    {
        _syntheticTokenIn.accrueInterest();
        _syntheticTokenOut.accrueInterest();

        address _account = _msgSender();

        require(_amountIn > 0, "amount-in-is-0");
        require(_amountIn <= _syntheticTokenIn.balanceOf(_account), "amount-in-gt-balance");

        _syntheticTokenIn.burn(_account, _amountIn);

        _amountOut = masterOracle.convert(_syntheticTokenIn, _syntheticTokenOut, _amountIn);

        uint256 _feeAmount;
        if (swapFee > 0) {
            _feeAmount = _amountOut.wadMul(swapFee);
            _syntheticTokenOut.mint(address(treasury), _feeAmount);
            _amountOut -= _feeAmount;
        }

        _syntheticTokenOut.mint(_account, _amountOut);

        emit SyntheticTokenSwapped(_account, _syntheticTokenIn, _syntheticTokenOut, _amountIn, _amountOut, _feeAmount);
    }

    /**
     * @notice Add synthetic token to vSynth offerings
     */
    function addSyntheticToken(address _syntheticToken) external override onlyGovernor {
        require(_syntheticToken != address(0), "address-is-null");

        require(syntheticTokens.add(_syntheticToken), "synthetic-exists");

        emit SyntheticTokenAdded(_syntheticToken);
    }

    /**
     * @notice Remove synthetic token from vSynth offerings
     */
    function removeSyntheticToken(ISyntheticToken _syntheticToken)
        external
        override
        onlyGovernor
        onlyIfSyntheticTokenExists(_syntheticToken)
    {
        require(_syntheticToken.totalSupply() == 0, "supply-gt-0");
        require(_syntheticToken.debtToken().totalSupply() == 0, "synthetic-with-debt-supply");

        require(syntheticTokens.remove(address(_syntheticToken)), "synthetic-doesnt-exist");

        emit SyntheticTokenRemoved(_syntheticToken);
    }

    /**
     * @notice Add deposit token (i.e. collateral) to vSynth
     */
    function addDepositToken(address _depositToken) external override onlyGovernor {
        require(_depositToken != address(0), "address-is-null");

        require(depositTokens.add(_depositToken), "deposit-token-exists");
        depositTokenOf[IDepositToken(_depositToken).underlying()] = IDepositToken(_depositToken);

        emit DepositTokenAdded(_depositToken);
    }

    /**
     * @notice Remove deposit token (i.e. collateral) from vSynth
     */
    function removeDepositToken(IDepositToken _depositToken)
        external
        override
        onlyGovernor
        onlyIfDepositTokenExists(_depositToken)
    {
        require(_depositToken.totalSupply() == 0, "supply-gt-0");

        require(depositTokens.remove(address(_depositToken)), "deposit-token-doesnt-exist");
        delete depositTokenOf[_depositToken.underlying()];

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
        require(depositTokensOfAccount.add(_account, _msgSender()), "deposit-token-exists");
    }

    /**
     * @notice Remove a deposit token from the per-account list
     * @dev This function is called from `DepositToken._afterTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function removeFromDepositTokensOfAccount(address _account) external {
        require(depositTokens.contains(_msgSender()), "caller-is-not-deposit-token");
        require(depositTokensOfAccount.remove(_account, _msgSender()), "deposit-token-doesnt-exist");
    }

    /**
     * @notice Add a debt token to the per-account list
     * @dev This function is called from `DebtToken._beforeTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function addToDebtTokensOfAccount(address _account) external onlyIfMsgSenderIsDebtToken {
        require(debtTokensOfAccount.add(_account, _msgSender()), "debt-token-exists");
    }

    /**
     * @notice Remove a debt token from the per-account list
     * @dev This function is called from `DebtToken._afterTokenTransfer` hook
     * @dev The caller should ensure to not pass `address(0)` as `_account`
     * @param _account The account address
     */
    function removeFromDebtTokensOfAccount(address _account) external onlyIfMsgSenderIsDebtToken {
        require(debtTokensOfAccount.remove(_account, _msgSender()), "debt-token-doesnt-exist");
    }

    /**
     * @notice Update master oracle contract
     */
    function updateMasterOracle(IMasterOracle _newMasterOracle) external override onlyGovernor {
        require(address(_newMasterOracle) != address(0), "address-is-null");
        IMasterOracle _currentMasterOracle = masterOracle;
        require(_newMasterOracle != _currentMasterOracle, "new-same-as-current");

        emit MasterOracleUpdated(_currentMasterOracle, _newMasterOracle);
        masterOracle = _newMasterOracle;
    }

    /**
     * @notice Update deposit fee
     */
    function updateDepositFee(uint256 _newDepositFee) external override onlyGovernor {
        require(_newDepositFee <= 1e18, "max-is-100%");
        uint256 _currentDepositFee = depositFee;
        require(_newDepositFee != _currentDepositFee, "new-same-as-current");
        emit DepositFeeUpdated(_currentDepositFee, _newDepositFee);
        depositFee = _newDepositFee;
    }

    /**
     * @notice Update issue fee
     */
    function updateIssueFee(uint256 _newIssueFee) external override onlyGovernor {
        require(_newIssueFee <= 1e18, "max-is-100%");
        uint256 _currentIssueFee = issueFee;
        require(_newIssueFee != _currentIssueFee, "new-same-as-current");
        emit IssueFeeUpdated(_currentIssueFee, _newIssueFee);
        issueFee = _newIssueFee;
    }

    /**
     * @notice Update withdraw fee
     */
    function updateWithdrawFee(uint256 _newWithdrawFee) external override onlyGovernor {
        require(_newWithdrawFee <= 1e18, "max-is-100%");
        uint256 _currentWithdrawFee = withdrawFee;
        require(_newWithdrawFee != _currentWithdrawFee, "new-same-as-current");
        emit WithdrawFeeUpdated(_currentWithdrawFee, _newWithdrawFee);
        withdrawFee = _newWithdrawFee;
    }

    /**
     * @notice Update repay fee
     */
    function updateRepayFee(uint256 _newRepayFee) external override onlyGovernor {
        require(_newRepayFee <= 1e18, "max-is-100%");
        uint256 _currentRepayFee = repayFee;
        require(_newRepayFee != _currentRepayFee, "new-same-as-current");
        emit RepayFeeUpdated(_currentRepayFee, _newRepayFee);
        repayFee = _newRepayFee;
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(uint256 _newSwapFee) external override onlyGovernor {
        require(_newSwapFee <= 1e18, "max-is-100%");
        uint256 _currentSwapFee = swapFee;
        require(_newSwapFee != _currentSwapFee, "new-same-as-current");
        emit SwapFeeUpdated(_currentSwapFee, _newSwapFee);
        swapFee = _newSwapFee;
    }

    /**
     * @notice Update liquidator liquidation fee
     */
    function updateLiquidatorLiquidationFee(uint256 _newLiquidatorLiquidationFee) external override onlyGovernor {
        require(_newLiquidatorLiquidationFee <= 1e18, "max-is-100%");
        uint256 _currentLiquidatorLiquidationFee = liquidatorLiquidationFee;
        require(_newLiquidatorLiquidationFee != _currentLiquidatorLiquidationFee, "new-same-as-current");
        emit LiquidatorLiquidationFeeUpdated(_currentLiquidatorLiquidationFee, _newLiquidatorLiquidationFee);
        liquidatorLiquidationFee = _newLiquidatorLiquidationFee;
    }

    /**
     * @notice Update protocol liquidation fee
     */
    function updateProtocolLiquidationFee(uint256 _newProtocolLiquidationFee) external override onlyGovernor {
        require(_newProtocolLiquidationFee <= 1e18, "max-is-100%");
        uint256 _currentProtocolLiquidationFee = protocolLiquidationFee;
        require(_newProtocolLiquidationFee != _currentProtocolLiquidationFee, "new-same-as-current");
        emit ProtocolLiquidationFeeUpdated(_currentProtocolLiquidationFee, _newProtocolLiquidationFee);
        protocolLiquidationFee = _newProtocolLiquidationFee;
    }

    /**
     * @notice Update maxLiquidable (liquidation cap)
     */
    function updateMaxLiquidable(uint256 _newMaxLiquidable) external override onlyGovernor {
        require(_newMaxLiquidable <= 1e18, "max-is-100%");
        uint256 _currentMaxLiquidable = maxLiquidable;
        require(_newMaxLiquidable != _currentMaxLiquidable, "new-same-as-current");
        emit MaxLiquidableUpdated(_currentMaxLiquidable, _newMaxLiquidable);
        maxLiquidable = _newMaxLiquidable;
    }

    /**
     * @notice Update debt floor
     */
    function updateDebtFloor(uint256 _newDebtFloorInUsd) external override onlyGovernor {
        uint256 _currentDebtFloorInUsd = debtFloorInUsd;
        require(_newDebtFloorInUsd != _currentDebtFloorInUsd, "new-same-as-current");
        emit DebtFloorUpdated(_currentDebtFloorInUsd, _newDebtFloorInUsd);
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

    /**
     * @notice Add a RewardsDistributor contract
     */
    function addRewardsDistributor(IRewardsDistributor _distributor) external override onlyGovernor {
        require(address(_distributor) != address(0), "address-is-null");

        for (uint256 i = 0; i < rewardsDistributors.length; i++)
            require(_distributor != rewardsDistributors[i], "contract-already-added");

        rewardsDistributors.push(_distributor);
        emit RewardsDistributorAdded(_distributor);
    }
}
