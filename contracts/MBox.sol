// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/ISyntheticAsset.sol";
import "./interface/IOracle.sol";
import "./interface/IDepositToken.sol";
import "./interface/IMBox.sol";
import "./lib/WadRayMath.sol";
import "./interface/ITreasury.sol";

/**
 * @title mBOX main contract
 */
contract MBox is Ownable, ReentrancyGuard, IMBox {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

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
    mapping(address => ISyntheticAsset) public syntheticAssetsByAddress;

    /// @notice Emitted when collateral is deposited
    event CollateralDeposited(address indexed account, uint256 amount);

    /// @notice Emitted when collateral is withdrawn
    event CollateralWithdrawn(address indexed account, uint256 amount);

    /// @notice Emitted when synthetic asset is minted
    event SyntheticAssetMinted(address indexed account, address syntheticAsseet, uint256 amount);

    /// @notice Emitted when synthetic's debt is repayed
    event DebtRepayed(address indexed account, address syntheticAsseet, uint256 amount);

    /// @notice Emitted when a position is liquidated
    event PositionLiquidated(
        address indexed liquidator,
        address indexed account,
        address syntheticAsseet,
        uint256 debtRepayed,
        uint256 depositSeized
    );

    /// @notice Emitted when synthetic asset is swapped
    event SyntheticAssetSwapped(
        address indexed account,
        address syntheticAssetIn,
        address syntheticAssetOut,
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
    event DepositFeeUpdated(uint256 newDepositFee);

    /// @notice Emitted when mint fee is updated
    event MintFeeUpdated(uint256 newMintFee);

    /// @notice Emitted when withdraw fee is updated
    event WithdrawFeeUpdated(uint256 newWithdrawFee);

    /// @notice Emitted when repay fee is updated
    event RepayFeeUpdated(uint256 newRepayFee);

    /// @notice Emitted when swap fee is updated
    event SwapFeeUpdated(uint256 newSwapFee);

    /// @notice Emitted when refinance fee is updated
    event RefinanceFeeUpdated(uint256 newRefinanceFee);

    /// @notice Emitted when liquidator fee is updated
    event LiquidatorFeeUpdated(uint256 newLiquidatorFee);

    /// @notice Emitted when liquidate fee is updated
    event LiquidateFeeUpdated(uint256 newLiquidateFee);

    /// @notice Emitted when treasury contract is updated
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /**
     * @dev Throws if synthetic asset isn't enabled
     */
    modifier onlyIfSyntheticAssetExists(ISyntheticAsset _syntheticAsset) {
        require(
            syntheticAssetsByAddress[address(_syntheticAsset)] != ISyntheticAsset(address(0)),
            "synthetic-asset-does-not-exists"
        );
        _;
    }

    /**
     * @notice Deposit MET as colleteral and mint mBOX-MET (tokenized deposit position)
     * @param _amount The amount of MET tokens to deposit
     */
    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "zero-collateral-amount");

        address _account = _msgSender();

        IERC20 met = IERC20(depositToken.underlying());

        met.safeTransferFrom(_account, address(treasury), _amount);

        uint256 _amountToMint = depositFee > 0 ? _amount.wadMul(1e18 - depositFee) : _amount;

        depositToken.mint(_account, _amountToMint);

        emit CollateralDeposited(_account, _amountToMint);
    }

    /**
     * @notice Get account's debt
     * @dev We can optimize this function by storing an array of which synthetics the account minted avoiding looping all
     * @param _account The account to check
     * @return _debtInUsd The debt value in USD
     * @return _lockedDepositInUsd The USD amount that's covering the debt (considering collateralization ratios)
     */
    function _debtOf(address _account) private view returns (uint256 _debtInUsd, uint256 _lockedDepositInUsd) {
        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            uint256 _amount = syntheticAssets[i].debtToken().balanceOf(_account);
            if (_amount > 0) {
                uint256 _amountInUsd = oracle.convertToUSD(syntheticAssets[i].underlying(), _amount);

                _debtInUsd += _amountInUsd;
                _lockedDepositInUsd += _amountInUsd.wadMul(syntheticAssets[i].collateralizationRatio());
            }
        }
    }

    /**
     * @notice Get total amount of deposit that's covering the account's debt
     * @param _account The account to check
     * @return _deposit The total amount of account's deposits
     * @return _unlockedDeposit The amount of deposit that isn't covering the account's debt
     * @return _lockedDeposit The amount of deposit that's covering the account's debt
     */
    function _depositOf(address _account)
        private
        view
        returns (
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        (, uint256 _lockedDepositInUsd) = _debtOf(_account);
        _lockedDeposit = oracle.convertFromUSD(depositToken.underlying(), _lockedDepositInUsd);
        _deposit = depositToken.balanceOf(_account);
        if (_lockedDeposit > _deposit) {
            _lockedDeposit = _deposit;
        }
        _unlockedDeposit = _deposit - _lockedDeposit;
    }

    /**
     * @notice Get debt position from an account
     * @param _account The account to check
     * @return _isHealthy Whether the account's position is healthy
     * @return _debtInUsd The total debt in USD
     * @return _lockedDepositInUsd The amount of deposit (is USD) that's covering all debt (considering collateralization ratios)
     * @return _depositInUsd The total collateral deposited in USD
     * @return _deposit The total amount of account's deposits
     * @return _unlockedDeposit The amount of deposit that isn't covering the account's debt
     * @return _lockedDeposit The amount of deposit that's covering the account's debt
     */
    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            bool _isHealthy,
            uint256 _debtInUsd,
            uint256 _lockedDepositInUsd,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        (_deposit, _unlockedDeposit, _lockedDeposit) = _depositOf(_account);
        _depositInUsd = oracle.convertToUSD(depositToken.underlying(), _deposit);
        (_debtInUsd, _lockedDepositInUsd) = _debtOf(_account);
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
        onlyIfSyntheticAssetExists(_syntheticAsset)
        returns (uint256 _maxIssuable)
    {
        (, uint256 _unlockedDeposit, ) = _depositOf(_account);

        uint256 _unlockedDepositInUsd = oracle.convertToUSD(depositToken.underlying(), _unlockedDeposit);

        uint256 _maxIssuableInUsd = _unlockedDepositInUsd.wadDiv(_syntheticAsset.collateralizationRatio());

        _maxIssuable = oracle.convertFromUSD(_syntheticAsset.underlying(), _maxIssuableInUsd);
    }

    /**
     * @notice Lock collateral and mint synthetic asset
     * @param _syntheticAsset The synthetic asset to mint
     * @param _amount The amount to mint
     */
    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount)
        external
        onlyIfSyntheticAssetExists(_syntheticAsset)
        nonReentrant
    {
        require(_amount > 0, "amount-to-mint-is-zero");

        address _account = _msgSender();

        uint256 _maxIssuable = maxIssuableFor(_account, _syntheticAsset);

        require(_amount <= _maxIssuable, "not-enough-collateral");

        uint256 _feeInSyntheticAsset;

        if (mintFee > 0) {
            _feeInSyntheticAsset = _amount.wadMul(mintFee);

            uint256 _feeInMet = oracle.convert(
                _syntheticAsset.underlying(),
                depositToken.underlying(),
                _feeInSyntheticAsset
            );

            depositToken.burnUnlocked(_account, _feeInMet);
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
    function withdraw(uint256 _amount) external nonReentrant {
        require(_amount > 0, "amount-to-withdraw-is-zero");

        address _account = _msgSender();

        (, uint256 _unlockedDeposit, ) = _depositOf(_account);

        require(_amount <= _unlockedDeposit, "amount-to-withdraw-gt-unlocked");

        depositToken.burnUnlocked(_account, _amount);

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
    function repay(ISyntheticAsset _syntheticAsset, uint256 _amount) external nonReentrant {
        address _account = _msgSender();
        _repay(_syntheticAsset, _account, _account, _amount);

        // Charging fee after repayment to reduce chances to have tx reverted due to low unlocked deposit
        if (repayFee > 0) {
            uint256 _feeInSyntheticAsset = _amount.wadMul(repayFee);
            uint256 _feeInMet = oracle.convert(
                _syntheticAsset.underlying(),
                depositToken.underlying(),
                _feeInSyntheticAsset
            );
            depositToken.burnUnlocked(_account, _feeInMet);
        }
    }

    /**
     * @notice Burn mEth, unlock mBOX-MET and send liquidator fee
     */
    function liquidate(
        ISyntheticAsset _syntheticAsset,
        address _account,
        uint256 _amountToRepay
    ) external nonReentrant {
        require(_amountToRepay > 0, "amount-to-repay-is-zero");
        address _liquidator = _msgSender();
        require(_liquidator != _account, "can-not-liquidate-own-position");

        (bool _isHealthy, , , , uint256 _deposit, , ) = debtPositionOf(_account);

        require(!_isHealthy, "position-is-healthy");

        _repay(_syntheticAsset, _account, _liquidator, _amountToRepay);

        uint256 _amountToRepayInMET = oracle.convert(
            _syntheticAsset.underlying(),
            depositToken.underlying(),
            _amountToRepay
        );

        uint256 _toCollect = liquidateFee > 0 ? _amountToRepayInMET.wadMul(liquidateFee) : 0;
        uint256 _toLiquidator = _amountToRepayInMET + _amountToRepayInMET.wadMul(liquidatorFee);
        uint256 _depositToSeize = _toCollect + _toLiquidator;
        require(_depositToSeize <= _deposit, "amount-to-repay-is-too-high");

        depositToken.seize(_account, _liquidator, _toLiquidator);

        if (_toCollect > 0) {
            depositToken.burn(_account, _toCollect);
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
        returns (uint256 _amountOut)
    {
        require(_amountIn > 0, "amount-in-is-zero");
        require(_amountIn <= _syntheticAssetIn.balanceOf(_account), "amount-in-gt-synthetic-balance");

        uint256 _feeInSyntheticAssetIn = _fee > 0 ? _amountIn.wadMul(_fee) : 0;
        uint256 _amountInAfterFee = _amountIn - _feeInSyntheticAssetIn;
        _amountOut = oracle.convert(_syntheticAssetIn.underlying(), _syntheticAssetOut.underlying(), _amountInAfterFee);

        _syntheticAssetIn.burn(_account, _amountIn);
        _syntheticAssetIn.debtToken().burn(_account, _amountIn);

        _syntheticAssetOut.mint(_account, _amountOut);
        _syntheticAssetOut.debtToken().mint(_account, _amountOut);

        if (_feeInSyntheticAssetIn > 0) {
            uint256 _feeInMet = oracle.convert(
                _syntheticAssetIn.underlying(),
                depositToken.underlying(),
                _feeInSyntheticAssetIn
            );
            depositToken.burnUnlocked(_account, _feeInMet);
        }

        (bool _isHealthy, , , , , , ) = debtPositionOf(_account);

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
    ) external nonReentrant returns (uint256 _amountOut) {
        address _account = _msgSender();
        (bool _isHealthy, , , , , , ) = debtPositionOf(_account);
        require(_isHealthy, "debt-position-is-unhealthy");

        return _swap(_account, _syntheticAssetIn, _syntheticAssetOut, _amountIn, swapFee);
    }

    /**
     * @notice Refinance debt by swaping for mETH (that has lower collateralization ratio)
     * @param _syntheticAssetIn Synthetic asset to sell
     * @param _amountToRefinance Amount to refinance
     */
    function refinance(ISyntheticAsset _syntheticAssetIn, uint256 _amountToRefinance) external nonReentrant {
        ISyntheticAsset _syntheticAssetOut = syntheticAssets[0]; // mETH
        require(
            _syntheticAssetIn.collateralizationRatio() > _syntheticAssetOut.collateralizationRatio(),
            "in-cratio-is-lte-out-cratio"
        );
        address _account = _msgSender();
        (bool _isHealthy, , , , , , ) = debtPositionOf(_account);
        require(!_isHealthy, "debt-position-is-healthy");

        _swap(_account, _syntheticAssetIn, _syntheticAssetOut, _amountToRefinance, refinanceFee);

        emit DebtRefinancied(_account, address(_syntheticAssetIn), _amountToRefinance);
    }

    /**
     * @notice Add synthetic token to mBOX offerings
     */
    function addSyntheticAsset(ISyntheticAsset _synthetic) public onlyOwner {
        address _syntheticAddress = address(_synthetic);
        require(_syntheticAddress != address(0), "address-is-null");
        require(address(syntheticAssetsByAddress[_syntheticAddress]) == address(0), "synthetic-asset-exists");

        syntheticAssets.push(_synthetic);
        syntheticAssetsByAddress[_syntheticAddress] = _synthetic;

        emit SyntheticAssetAdded(_syntheticAddress);
    }

    /**
     * @notice Remove synthetic token from mBOX offerings
     */
    function removeSyntheticAsset(ISyntheticAsset _synthetic) public onlyOwner onlyIfSyntheticAssetExists(_synthetic) {
        require(_synthetic.totalSupply() == 0, "synthetic-asset-with-supply");

        address _syntheticAddress = address(_synthetic);

        for (uint256 i = 0; i < syntheticAssets.length; i++) {
            if (syntheticAssets[i] == _synthetic) {
                require(i > 0, "can-not-delete-meth");
                delete syntheticAssets[i];

                // Copy the last synthetic asset into the place of the one we just deleted
                // If there's only one synthetic asset, this is syntheticAssets[0] = syntheticAssets[0]
                syntheticAssets[i] = syntheticAssets[syntheticAssets.length - 1];

                // Decrease the size of the array by one
                syntheticAssets.pop();

                break;
            }
        }

        delete syntheticAssetsByAddress[_syntheticAddress];

        emit SyntheticAssetRemoved(_syntheticAddress);
    }

    /**
     * @notice Update treasury contract - will migrate funds to the new contract
     */
    function updateTreasury(address _newTreasury) public onlyOwner {
        require(_newTreasury != address(0), "treasury-address-is-null");
        require(_newTreasury != address(treasury), "new-treasury-is-same-as-current");

        // TODO: Remove this check when implementing MBox.init() function
        // refs: https://github.com/bloqpriv/mbox/issues/10
        if (address(treasury) != address(0)) {
            IERC20 met = IERC20(depositToken.underlying());
            treasury.pull(_newTreasury, met.balanceOf(address(treasury)));
        }

        emit TreasuryUpdated(address(treasury), _newTreasury);

        treasury = ITreasury(_newTreasury);
    }

    /**
     * @notice Set deposit (mBOX-MET) contract
     */
    function setDepositToken(IDepositToken _depositToken) public onlyOwner {
        depositToken = _depositToken;
    }

    /**
     * @notice Set price oracle contract
     */
    function setOracle(IOracle _oracle) public onlyOwner {
        oracle = _oracle;
    }

    /**
     * @notice Set deposit fee
     */
    function setDepositFee(uint256 _depositFee) public onlyOwner {
        depositFee = _depositFee;
        emit DepositFeeUpdated(_depositFee);
    }

    /**
     * @notice Set mint fee
     */
    function setMintFee(uint256 _mintFee) public onlyOwner {
        mintFee = _mintFee;
        emit MintFeeUpdated(_mintFee);
    }

    /**
     * @notice Set withdraw fee
     */
    function setWithdrawFee(uint256 _withdrawFee) public onlyOwner {
        withdrawFee = _withdrawFee;
        emit WithdrawFeeUpdated(_withdrawFee);
    }

    /**
     * @notice Set repay fee
     */
    function setRepayFee(uint256 _repayFee) public onlyOwner {
        repayFee = _repayFee;
        emit RepayFeeUpdated(_repayFee);
    }

    /**
     * @notice Set swap fee
     */
    function setSwapFee(uint256 _swapFee) public onlyOwner {
        swapFee = _swapFee;
        emit SwapFeeUpdated(_swapFee);
    }

    /**
     * @notice Set refinance fee
     */
    function setRefinanceFee(uint256 _refinanceFee) public onlyOwner {
        refinanceFee = _refinanceFee;
        emit RefinanceFeeUpdated(_refinanceFee);
    }

    /**
     * @notice Set liquidator fee
     */
    function setLiquidatorFee(uint256 _liquidatorFee) public onlyOwner {
        liquidatorFee = _liquidatorFee;
        emit LiquidatorFeeUpdated(_liquidatorFee);
    }

    /**
     * @notice Set liquidate fee
     */
    function setLiquidateFee(uint256 _liquidateFee) public onlyOwner {
        liquidateFee = _liquidateFee;
        emit LiquidateFeeUpdated(_liquidateFee);
    }
}
