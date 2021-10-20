// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Governable.sol";
import "./interface/IMBox.sol";
import "./lib/WadRayMath.sol";
import "./interface/ITreasury.sol";

contract MBoxStorageV1 {
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
     * @notice Represents MET collateral's deposits (mBOX-MET token)
     */
    IDepositToken public depositToken;

    /**
     * @notice Prices oracle
     */
    IOracle public oracle;

    /**
     * @notice Avaliable synthetic assets
     * @dev The syntheticAssets[0] is mETH
     */
    ISyntheticAsset[] public syntheticAssets;
    mapping(address => ISyntheticAsset) public syntheticAssetByAddress;
}

/**
 * @title mBOX main contract
 */
contract MBox is IMBox, ReentrancyGuard, Governable, MBoxStorageV1 {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(address indexed account, uint256 amount);

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(address indexed account, uint256 amount);

    /// @notice Emitted when synthetic asset is minted
    event SyntheticAssetMinted(address indexed account, address indexed syntheticAsset, uint256 amount);

    /// @notice Emitted when synthetic's debt is repayed
    event DebtRepayed(address indexed account, address indexed syntheticAsset, uint256 amount);

    /// @notice Emitted when a position is liquidated
    event PositionLiquidated(
        address indexed liquidator,
        address indexed account,
        address indexed syntheticAsset,
        uint256 debtRepayed,
        uint256 depositSeized
    );

    /// @notice Emitted when synthetic asset is swapped
    event SyntheticAssetSwapped(
        address indexed account,
        address indexed syntheticAssetIn,
        address indexed syntheticAssetOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Emitted when debt is refinancied
    event DebtRefinancied(address indexed account, address syntheticAsset, uint256 amount);

    /// @notice Emitted when synthetic asset is enabled
    event SyntheticAssetAdded(address indexed syntheticAsset);

    /// @notice Emitted when synthetic asset is disabled
    event SyntheticAssetRemoved(address indexed syntheticAsset);

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
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Emitted when deposit token contract is updated
    event DepositTokenUpdated(IDepositToken indexed oldDepositToken, IDepositToken indexed newDepositToken);

    /// @notice Emitted when oracle contract is updated
    event OracleUpdated(IOracle indexed oldOracle, IOracle indexed newOracle);

    /**
     * @dev Throws if synthetic asset isn't enabled
     */
    modifier onlyIfSyntheticAssetExists(ISyntheticAsset _syntheticAsset) {
        require(
            syntheticAssetByAddress[address(_syntheticAsset)] != ISyntheticAsset(address(0)),
            "synthetic-asset-does-not-exists"
        );
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
     * @dev Update prices of assets that are used by the account (checks synthetic assets and MET)
     */
    modifier updatePricesOfAssetsUsedBy(address _account) {
        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            if (syntheticAssets[i].debtToken().balanceOf(_account) > 0) {
                oracle.update(syntheticAssets[i]);
            }
        }

        if (depositToken.balanceOf(_account) > 0) {
            oracle.update(depositToken.underlying());
        }
        _;
    }

    /**
     * @dev Update a specific asset's price (also updates the MET price)
     */
    modifier updatePriceOfAsset(ISyntheticAsset _syntheticAsset) {
        oracle.update(_syntheticAsset);
        oracle.update(depositToken.underlying());
        _;
    }

    function initialize(
        ITreasury _treasury,
        IDepositToken _depositToken,
        ISyntheticAsset _mETH,
        IOracle _oracle
    ) public initializer {
        require(address(_treasury) != address(0), "treasury-address-is-null");
        require(address(_depositToken) != address(0), "deposit-token-is-null");
        require(address(_oracle) != address(0), "oracle-is-null");

        __ReentrancyGuard_init();
        __Governable_init();

        treasury = _treasury;
        depositToken = _depositToken;
        oracle = _oracle;

        depositFee = 0;
        mintFee = 0;
        withdrawFee = 0;
        repayFee = 3e15; // 0.3%
        swapFee = 6e15; // 0.6%
        refinanceFee = 15e15; // 1.5%
        liquidatorFee = 1e17; // 10%
        liquidateFee = 8e16; // 8%
        maxLiquidable = 1e18; // 100%

        // Ensuring that mETH is 0 the syntheticAssets[0]
        addSyntheticAsset(_mETH);
    }

    /**
     * @notice Deposit MET as colleteral and mint mBOX-MET (tokenized deposit position)
     * @param _amount The amount of MET tokens to deposit
     */
    function deposit(uint256 _amount) external override nonReentrant {
        require(_amount > 0, "zero-collateral-amount");

        address _account = _msgSender();

        IERC20 met = IERC20(depositToken.underlying());

        met.safeTransferFrom(_account, address(treasury), _amount);

        uint256 _amountToMint = depositFee > 0 ? _amount.wadMul(1e18 - depositFee) : _amount;

        // We are collecting fee here by minting less deposit tokens than the METs deposited
        depositToken.mint(_account, _amountToMint);

        emit CollateralDeposited(_account, _amountToMint);
    }

    /**
     * @notice Get account's debt by querying latest prices from oracles
     * @dev We can optimize this function by storing an array of which synthetics the account minted avoiding looping all
     * @param _account The account to check
     * @return _debtInUsd The debt value in USD
     * @return _lockedDepositInUsd The USD amount that's covering the debt (considering collateralization ratios)
     * @return _anyPriceInvalid Returns true if any price is invalid
     */
    function debtOfUsingLatestPrices(address _account)
        public
        view
        override
        returns (
            uint256 _debtInUsd,
            uint256 _lockedDepositInUsd,
            bool _anyPriceInvalid
        )
    {
        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            uint256 _amount = syntheticAssets[i].debtToken().balanceOf(_account);
            if (_amount > 0) {
                (uint256 _amountInUsd, bool _priceInvalid) = oracle.convertToUsdUsingLatestPrice(
                    syntheticAssets[i],
                    _amount
                );

                if (_priceInvalid) _anyPriceInvalid = true;

                _debtInUsd += _amountInUsd;
                _lockedDepositInUsd += _amountInUsd.wadMul(syntheticAssets[i].collateralizationRatio());
            }
        }
    }

    /**
     * @notice Get debt position from an account
     * @param _account The account to check
     * @return _isHealthy Whether the account's position is healthy
     * @return _lockedDepositInUsd The amount of deposit (is USD) that's covering all debt (considering collateralization ratios)
     * @return _depositInUsd The total collateral deposited in USD
     * @return _deposit The total amount of account's deposits
     * @return _unlockedDeposit The amount of deposit that isn't covering the account's debt
     * @return _lockedDeposit The amount of deposit that's covering the account's debt
     * @return _anyPriceInvalid Returns true if any price is invalid
     */
    function debtPositionOfUsingLatestPrices(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit,
            bool _anyPriceInvalid
        )
    {
        (, _lockedDepositInUsd, _anyPriceInvalid) = debtOfUsingLatestPrices(_account);

        bool _depositPriceInvalid;
        (_lockedDeposit, _depositPriceInvalid) = oracle.convertFromUsdUsingLatestPrice(
            depositToken.underlying(),
            _lockedDepositInUsd
        );

        _deposit = depositToken.balanceOf(_account);
        (_depositInUsd, ) = oracle.convertToUsdUsingLatestPrice(depositToken.underlying(), _deposit);

        if (_lockedDeposit > _deposit) {
            _lockedDeposit = _deposit;
        }
        _unlockedDeposit = _deposit - _lockedDeposit;
        _isHealthy = _depositInUsd >= _lockedDepositInUsd;
        _anyPriceInvalid = _anyPriceInvalid || _depositPriceInvalid;
    }

    /**
     * @notice Get debt position from an account
     * @param _account The account to check
     * @return _isHealthy Whether the account's position is healthy
     * @return _lockedDepositInUsd The amount of deposit (is USD) that's covering all debt (considering collateralization ratios)
     * @return _depositInUsd The total collateral deposited in USD
     * @return _deposit The total amount of account's deposits
     * @return _unlockedDeposit The amount of deposit that isn't covering the account's debt
     * @return _lockedDeposit The amount of deposit that's covering the account's debt
     */
    function debtPositionOf(address _account)
        public
        override
        updatePricesOfAssetsUsedBy(_account)
        returns (
            bool _isHealthy,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        bool _anyPriceInvalid;
        (
            _isHealthy,
            _lockedDepositInUsd,
            _depositInUsd,
            _deposit,
            _unlockedDeposit,
            _lockedDeposit,
            _anyPriceInvalid
        ) = debtPositionOfUsingLatestPrices(_account);
        require(!_anyPriceInvalid, "invalid-price");
    }

    /**
     * @notice Get max issuable synthetic asset amount for a given account
     * @param _account The account to check
     * @param _syntheticAsset The synthetic asset to check issuance
     * @return _maxIssuable The max issuable amount
     * @return _anyPriceInvalid Returns true if any price is invalid
     */
    function maxIssuableForUsingLatestPrices(address _account, ISyntheticAsset _syntheticAsset)
        public
        view
        override
        onlyIfSyntheticAssetExists(_syntheticAsset)
        returns (uint256 _maxIssuable, bool _anyPriceInvalid)
    {
        if (!_syntheticAsset.isActive()) {
            return (0, false);
        }

        (, , , , uint256 _unlockedDeposit, , ) = debtPositionOfUsingLatestPrices(_account);

        (_maxIssuable, _anyPriceInvalid) = oracle.convertUsingLatestPrice(
            depositToken.underlying(),
            _syntheticAsset,
            _unlockedDeposit.wadDiv(_syntheticAsset.collateralizationRatio())
        );
    }

    /**
     * @notice Get max issuable synthetic asset amount for a given account
     * @dev This function will revert if any price from oracle is invalid
     * @param _account The account to check
     * @param _syntheticAsset The synthetic asset to check issuance
     * @return _maxIssuable The max issuable amount
     */
    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset)
        public
        override
        onlyIfSyntheticAssetExists(_syntheticAsset)
        updatePriceOfAsset(_syntheticAsset)
        returns (uint256 _maxIssuable)
    {
        bool _anyPriceInvalid;
        (_maxIssuable, _anyPriceInvalid) = maxIssuableForUsingLatestPrices(_account, _syntheticAsset);
        require(!_anyPriceInvalid, "invalid-price");
    }

    /**
     * @notice Lock collateral and mint synthetic asset
     * @param _syntheticAsset The synthetic asset to mint
     * @param _amount The amount to mint
     */
    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount)
        external
        override
        onlyIfSyntheticAssetExists(_syntheticAsset)
        onlyIfSyntheticAssetIsActive(_syntheticAsset)
        nonReentrant
    {
        require(_amount > 0, "amount-to-mint-is-zero");

        address _account = _msgSender();

        require(_amount <= maxIssuableFor(_account, _syntheticAsset), "not-enough-collateral");

        uint256 _feeInSyntheticAsset;

        if (mintFee > 0) {
            _feeInSyntheticAsset = _amount.wadMul(mintFee);

            depositToken.burnAsFee(
                _account,
                oracle.convert(_syntheticAsset, depositToken.underlying(), _feeInSyntheticAsset)
            );
        }

        uint256 _amountToMint = _amount - _feeInSyntheticAsset;

        _syntheticAsset.debtToken().mint(_account, _amountToMint);

        _syntheticAsset.mint(_account, _amountToMint);

        emit SyntheticAssetMinted(_account, address(_syntheticAsset), _amountToMint);
    }

    /**
     * @notice Burn mBOX-MET and withdraw MET
     * @param _amount The amount of MET to withdraw
     */
    function withdraw(uint256 _amount) external override nonReentrant {
        require(_amount > 0, "amount-to-withdraw-is-zero");

        address _account = _msgSender();

        (, , , , uint256 _unlockedDeposit, ) = debtPositionOf(_account);

        require(_amount <= _unlockedDeposit, "amount-to-withdraw-gt-unlocked");

        depositToken.burnForWithdraw(_account, _amount);

        uint256 _amountToWithdraw = withdrawFee > 0 ? _amount - _amount.wadMul(withdrawFee) : _amount;

        treasury.pull(_account, _amountToWithdraw);

        emit CollateralWithdrawn(_account, _amountToWithdraw);
    }

    /**
     * @notice Send synthetic asset to decrease debt
     * @dev Burn synthetic asset and equivalent debt token to unlock deposit token (mBOX-MET)
     * @param _syntheticAsset The synthetic asset to burn
     * @param _account The account that will have debt decreased
     * @param _payer The account to burn synthetic asset from
     * @param _amount The amount of synthetic asset to burn
     */
    function _repay(
        ISyntheticAsset _syntheticAsset,
        address _account,
        address _payer,
        uint256 _amount
    ) private onlyIfSyntheticAssetExists(_syntheticAsset) {
        require(_amount > 0, "amount-to-repay-is-zero");
        require(_amount <= _syntheticAsset.debtToken().balanceOf(_account), "amount-gt-burnable-debt");
        require(_amount <= _syntheticAsset.balanceOf(_payer), "amount-gt-burnable-synthetic");

        _syntheticAsset.debtToken().burn(_account, _amount);
        _syntheticAsset.burn(_payer, _amount);

        emit DebtRepayed(_account, address(_syntheticAsset), _amount);
    }

    /**
     * @notice Send synthetic asset to decrease debt
     * @dev The msg.sender is the payer and the account beneficied
     * @param _syntheticAsset The synthetic asset to burn
     * @param _amount The amount of synthetic asset to burn
     */
    function repay(ISyntheticAsset _syntheticAsset, uint256 _amount) external override nonReentrant {
        address _account = _msgSender();
        _repay(_syntheticAsset, _account, _account, _amount);

        // Charging fee after repayment to reduce chances to have tx reverted due to low unlocked deposit
        if (repayFee > 0) {
            uint256 _feeInMet = oracle.convert(_syntheticAsset, depositToken.underlying(), _amount.wadMul(repayFee));
            depositToken.burnAsFee(_account, _feeInMet);
        }
    }

    /**
     * @notice Burn mEth, unlock mBOX-MET and send liquidator fee
     */
    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay
    ) external override nonReentrant {
        require(_amountToRepay > 0, "amount-to-repay-is-zero");
        address _liquidator = _msgSender();
        require(_liquidator != _account, "can-not-liquidate-own-position");

        uint256 _percentOfDebtToLiquidate = _amountToRepay.wadDiv(_syntheticAsset.debtToken().balanceOf(_account));

        require(_percentOfDebtToLiquidate <= maxLiquidable, "amount-gt-max-liquidable");

        (bool _isHealthy, , , uint256 _deposit, , ) = debtPositionOf(_account);

        require(!_isHealthy, "position-is-healthy");

        uint256 _amountToRepayInMET = oracle.convert(_syntheticAsset, depositToken.underlying(), _amountToRepay);

        uint256 _toCollectAsFee = liquidateFee > 0 ? _amountToRepayInMET.wadMul(liquidateFee) : 0;
        uint256 _toLiquidator = _amountToRepayInMET + _amountToRepayInMET.wadMul(liquidatorFee);
        uint256 _depositToSeize = _toCollectAsFee + _toLiquidator;
        require(_depositToSeize <= _deposit, "amount-to-repay-is-too-high");

        _repay(_syntheticAsset, _account, _liquidator, _amountToRepay);

        depositToken.seize(_account, _liquidator, _toLiquidator);

        if (_toCollectAsFee > 0) {
            // Not using `burnAsFee` because we want to collect even from the locked amount
            depositToken.burn(_account, _toCollectAsFee);
        }

        emit PositionLiquidated(_liquidator, _account, address(_syntheticAsset), _amountToRepay, _depositToSeize);
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

        _syntheticAssetIn.burn(_account, _amountIn);
        _syntheticAssetIn.debtToken().burn(_account, _amountIn);

        _syntheticAssetOut.mint(_account, _amountOut);
        _syntheticAssetOut.debtToken().mint(_account, _amountOut);

        if (_feeInSyntheticAssetIn > 0) {
            uint256 _feeInMet = oracle.convert(_syntheticAssetIn, depositToken.underlying(), _feeInSyntheticAssetIn);
            depositToken.burnAsFee(_account, _feeInMet);
        }

        (bool _isHealthy, , , , , ) = debtPositionOf(_account);

        require(_isHealthy, "debt-position-ended-up-unhealthy");

        emit SyntheticAssetSwapped(
            _account,
            address(_syntheticAssetIn),
            address(_syntheticAssetOut),
            _amountIn,
            _amountOut
        );
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
    ) external override nonReentrant returns (uint256 _amountOut) {
        address _account = _msgSender();
        (bool _isHealthy, , , , , ) = debtPositionOf(_account);
        require(_isHealthy, "debt-position-is-unhealthy");

        return _swap(_account, _syntheticAssetIn, _syntheticAssetOut, _amountIn, swapFee);
    }

    /**
     * @notice Refinance debt by swaping for mETH (that has lower collateralization ratio)
     * @param _syntheticAssetIn Synthetic asset to sell
     * @param _amountToRefinance Amount to refinance
     */
    function refinance(ISyntheticAsset _syntheticAssetIn, uint256 _amountToRefinance) external override nonReentrant {
        ISyntheticAsset _syntheticAssetOut = syntheticAssets[0]; // mETH
        require(
            _syntheticAssetIn.collateralizationRatio() > _syntheticAssetOut.collateralizationRatio(),
            "in-cratio-is-lte-out-cratio"
        );
        address _account = _msgSender();
        (bool _isHealthy, , , , , ) = debtPositionOf(_account);
        require(!_isHealthy, "debt-position-is-healthy");

        _swap(_account, _syntheticAssetIn, _syntheticAssetOut, _amountToRefinance, refinanceFee);

        emit DebtRefinancied(_account, address(_syntheticAssetIn), _amountToRefinance);
    }

    /**
     * @notice Add synthetic token to mBOX offerings
     */
    function addSyntheticAsset(ISyntheticAsset _synthetic) public override onlyGovernor {
        address _syntheticAddress = address(_synthetic);
        require(_syntheticAddress != address(0), "address-is-null");
        require(address(syntheticAssetByAddress[_syntheticAddress]) == address(0), "synthetic-asset-exists");

        syntheticAssets.push(_synthetic);
        syntheticAssetByAddress[_syntheticAddress] = _synthetic;

        emit SyntheticAssetAdded(_syntheticAddress);
    }

    /**
     * @notice Remove synthetic token from mBOX offerings
     */
    function removeSyntheticAsset(ISyntheticAsset _synthetic)
        public
        override
        onlyGovernor
        onlyIfSyntheticAssetExists(_synthetic)
    {
        require(_synthetic.totalSupply() == 0, "synthetic-asset-with-supply");
        require(_synthetic != syntheticAssets[0], "can-not-delete-meth");

        for (uint256 i = 0; i < syntheticAssets.length; i++) {
            if (syntheticAssets[i] == _synthetic) {
                // Copy the last synthetic asset into the place of the one we just deleted
                // If there's only one synthetic asset, this is syntheticAssets[0] = syntheticAssets[0]
                syntheticAssets[i] = syntheticAssets[syntheticAssets.length - 1];

                // Decrease the size of the array by one
                syntheticAssets.pop();

                break;
            }
        }

        address _syntheticAddress = address(_synthetic);

        delete syntheticAssetByAddress[_syntheticAddress];

        emit SyntheticAssetRemoved(_syntheticAddress);
    }

    /**
     * @notice Update treasury contract - will migrate funds to the new contract
     */
    function updateTreasury(address _newTreasury) public override onlyGovernor {
        require(_newTreasury != address(0), "treasury-address-is-null");
        require(_newTreasury != address(treasury), "new-treasury-is-same-as-current");

        IERC20 met = IERC20(depositToken.underlying());
        treasury.pull(_newTreasury, met.balanceOf(address(treasury)));

        emit TreasuryUpdated(address(treasury), _newTreasury);

        treasury = ITreasury(_newTreasury);
    }

    /**
     * @notice Update deposit (mBOX-MET) contract
     */
    function updateDepositToken(IDepositToken _newDepositToken) public override onlyGovernor {
        require(address(_newDepositToken) != address(0), "deposit-token-address-is-null");
        require(_newDepositToken != depositToken, "deposit-token-is-same-as-current");
        require(depositToken.totalSupply() == 0, "current-deposit-token-has-supply");

        emit DepositTokenUpdated(depositToken, _newDepositToken);
        depositToken = _newDepositToken;
    }

    /**
     * @notice Update price oracle contract
     */
    function updateOracle(IOracle _newOracle) public override onlyGovernor {
        require(address(_newOracle) != address(0), "oracle-address-is-null");
        require(_newOracle != oracle, "new-oracle-is-same-as-current");

        emit OracleUpdated(oracle, _newOracle);
        oracle = _newOracle;
    }

    /**
     * @notice Update deposit fee
     */
    function updateDepositFee(uint256 _newDepositFee) public override onlyGovernor {
        require(_newDepositFee <= 1e18, "deposit-fee-gt-100%");
        emit DepositFeeUpdated(depositFee, _newDepositFee);
        depositFee = _newDepositFee;
    }

    /**
     * @notice Update mint fee
     */
    function updateMintFee(uint256 _newMintFee) public override onlyGovernor {
        require(_newMintFee <= 1e18, "mint-fee-gt-100%");
        emit MintFeeUpdated(mintFee, _newMintFee);
        mintFee = _newMintFee;
    }

    /**
     * @notice Update withdraw fee
     */
    function updateWithdrawFee(uint256 _newWithdrawFee) public override onlyGovernor {
        require(_newWithdrawFee <= 1e18, "withdraw-fee-gt-100%");
        emit WithdrawFeeUpdated(withdrawFee, _newWithdrawFee);
        withdrawFee = _newWithdrawFee;
    }

    /**
     * @notice Update repay fee
     */
    function updateRepayFee(uint256 _newRepayFee) public override onlyGovernor {
        require(_newRepayFee <= 1e18, "repay-fee-gt-100%");
        emit RepayFeeUpdated(repayFee, _newRepayFee);
        repayFee = _newRepayFee;
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(uint256 _newSwapFee) public override onlyGovernor {
        require(_newSwapFee <= 1e18, "swap-fee-gt-100%");
        emit SwapFeeUpdated(swapFee, _newSwapFee);
        swapFee = _newSwapFee;
    }

    /**
     * @notice Update refinance fee
     */
    function updateRefinanceFee(uint256 _newRefinanceFee) public override onlyGovernor {
        require(_newRefinanceFee <= 1e18, "refinance-fee-gt-100%");
        emit RefinanceFeeUpdated(refinanceFee, _newRefinanceFee);
        refinanceFee = _newRefinanceFee;
    }

    /**
     * @notice Update liquidator fee
     */
    function updateLiquidatorFee(uint256 _newLiquidatorFee) public override onlyGovernor {
        require(_newLiquidatorFee <= 1e18, "liquidator-fee-gt-100%");
        emit LiquidatorFeeUpdated(liquidatorFee, _newLiquidatorFee);
        liquidatorFee = _newLiquidatorFee;
    }

    /**
     * @notice Update liquidate fee
     */
    function updateLiquidateFee(uint256 _newLiquidateFee) public override onlyGovernor {
        require(_newLiquidateFee <= 1e18, "liquidate-fee-gt-100%");
        emit LiquidateFeeUpdated(liquidateFee, _newLiquidateFee);
        liquidateFee = _newLiquidateFee;
    }

    /**
     * @notice Update maxLiquidable (liquidation cap)
     */
    function updateMaxLiquidable(uint256 _newMaxLiquidable) public override onlyGovernor {
        require(_newMaxLiquidable != maxLiquidable, "new-value-is-same-as-current");
        require(_newMaxLiquidable <= 1e18, "max-liquidable-gt-100%");
        emit MaxLiquidableUpdated(maxLiquidable, _newMaxLiquidable);
        maxLiquidable = _newMaxLiquidable;
    }
}
