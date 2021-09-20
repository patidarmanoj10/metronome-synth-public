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

/**
 * @title mBOX main contract
 */
contract MBox is Ownable, ReentrancyGuard, IMBox {
    using SafeERC20 for IERC20;

    /**
     * @notice The fee that is used as liquidation incentive
     */
    uint256 public liquidatorFee;

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
     */
    ISyntheticAsset[] public syntheticAssets;
    mapping(address => ISyntheticAsset) public syntheticAssetsByAddress;

    /**
     * @notice Emitted when collateral is deposited
     */
    event CollateralDeposited(address indexed account, uint256 amount);

    /**
     * @notice Emitted when collateral is withdrawn
     */
    event CollateralWithdrawn(address indexed account, uint256 amount);

    /**
     * @notice Emitted when synthetic asset is minted
     */
    event SyntheticAssetMinted(address indexed account, address syntheticAsseet, uint256 amount);

    /**
     * @notice Emitted when synthetic's debt is repayed
     */
    event DebtRepayed(address indexed account, address syntheticAsseet, uint256 amount);

    /**
     * @notice Emitted when a position is liquidated
     */
    event PositionLiquidated(
        address indexed liquidator,
        address indexed account,
        address syntheticAsseet,
        uint256 debtRepayed,
        uint256 depositSeized
    );

    /**
     * @notice Emitted when synthetic asset is swapped
     */
    event SyntheticAssetSwapped(
        address indexed account,
        address syntheticAsseetIn,
        address syntheticAsseetOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /**
     * @notice Emitted when synthetic asset is enabled
     */
    event SyntheticAssetAdded(address indexed syntheticAsset);

    /**
     * @notice Emitted when synthetic asset is disabled
     */
    event SyntheticAssetRemoved(address indexed syntheticAsset);

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

        met.safeTransferFrom(_account, address(this), _amount);

        depositToken.mint(_account, _amount);

        emit CollateralDeposited(_account, _amount);
    }

    /**
     * @notice Get account's debt in USD
     * @dev We can optimize this function by storing an array of which synthetics the account minted avoiding looping all
     * @param _account The account to check
     * @return _debtInUsd The debt value in USD
     * @return _debtInUsdWithCollateralization The debt value in USD considering collateralization ratios
     */
    function _debtOf(address _account)
        private
        view
        returns (uint256 _debtInUsd, uint256 _debtInUsdWithCollateralization)
    {
        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            uint256 _amount = syntheticAssets[i].debtToken().balanceOf(_account);
            if (_amount > 0) {
                uint256 _amountInUsd = oracle.convertToUSD(syntheticAssets[i].underlying(), _amount);

                _debtInUsd += _amountInUsd;
                _debtInUsdWithCollateralization += (_amountInUsd * syntheticAssets[i].collateralizationRatio()) / 1e18;
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
        (, uint256 _debtInUsdWithCollateralization) = _debtOf(_account);
        _lockedDeposit = oracle.convertFromUSD(depositToken.underlying(), _debtInUsdWithCollateralization);
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
     * @return _debtInUsdWithCollateralization The total debt in USD considering collateralization ratio
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
            uint256 _debtInUsdWithCollateralization,
            uint256 _depositInUsd,
            uint256 _deposit,
            uint256 _unlockedDeposit,
            uint256 _lockedDeposit
        )
    {
        (_deposit, _unlockedDeposit, _lockedDeposit) = _depositOf(_account);
        _depositInUsd = oracle.convertToUSD(depositToken.underlying(), _deposit);
        (_debtInUsd, _debtInUsdWithCollateralization) = _debtOf(_account);
        _isHealthy = _depositInUsd >= _debtInUsdWithCollateralization;
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
        (, , , , , uint256 _unlockedDeposit, ) = debtPositionOf(_account);

        uint256 _unlockedDepositInUsd = oracle.convertToUSD(depositToken.underlying(), _unlockedDeposit);

        uint256 _maxIssuableInUsd = (_unlockedDepositInUsd * 1e18) / _syntheticAsset.collateralizationRatio();

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

        _syntheticAsset.debtToken().mint(_account, _amount);

        _syntheticAsset.mint(_account, _amount);

        emit SyntheticAssetMinted(_account, address(_syntheticAsset), _amount);
    }

    /**
     * @notice Burn mBOX-MET and withdraw MET
     * @param _amount The amount of MET to withdraw
     */
    function withdraw(uint256 _amount) external nonReentrant {
        require(_amount > 0, "amount-to-withdraw-is-zero");

        address _account = _msgSender();

        (, , , , , uint256 _unlockedDeposit, ) = debtPositionOf(_account);

        require(_amount <= _unlockedDeposit, "amount-to-withdraw-gt-unlocked");

        depositToken.burn(_account, _amount);

        IERC20 met = IERC20(depositToken.underlying());

        met.safeTransfer(_account, _amount);

        emit CollateralWithdrawn(_account, _amount);
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
        _repay(_syntheticAsset, _msgSender(), _msgSender(), _amount);
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

        uint256 _amountToRepayInUsd = oracle.convertToUSD(_syntheticAsset.underlying(), _amountToRepay);

        uint256 _depositToSeizeInUsd = _amountToRepayInUsd + (_amountToRepayInUsd * liquidatorFee) / 1e18;

        uint256 _depositToSeize = oracle.convertFromUSD(depositToken.underlying(), _depositToSeizeInUsd);

        require(_depositToSeize <= _deposit, "amount-to-repay-is-too-high");

        depositToken.seize(_account, _liquidator, _depositToSeize);

        emit PositionLiquidated(_liquidator, _account, address(_syntheticAsset), _amountToRepay, _depositToSeize);
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
    )
        external
        onlyIfSyntheticAssetExists(_syntheticAssetIn)
        onlyIfSyntheticAssetExists(_syntheticAssetOut)
        returns (uint256 _amountOut)
    {
        require(_amountIn > 0, "amount-in-is-zero");
        address _account = _msgSender();
        require(_amountIn <= _syntheticAssetIn.balanceOf(_account), "amount-in-gt-synthetic-balance");

        uint256 _amountInUsd = oracle.convertToUSD(_syntheticAssetIn.underlying(), _amountIn);
        _amountOut = oracle.convertFromUSD(_syntheticAssetOut.underlying(), _amountInUsd);

        _syntheticAssetIn.burn(_account, _amountIn);
        _syntheticAssetIn.debtToken().burn(_account, _amountIn);

        _syntheticAssetOut.mint(_account, _amountOut);
        _syntheticAssetOut.debtToken().mint(_account, _amountOut);

        (bool _isHealthy, , , , , , ) = debtPositionOf(_account);

        // Note: Keeping this check here for the sake of the business logic quick implementation
        // TODO: Try to move this check to the top of this block for security reasons
        require(_isHealthy, "debt-position-becomes-unhealthy");

        emit SyntheticAssetSwapped(
            _account,
            address(_syntheticAssetIn),
            address(_syntheticAssetOut),
            _amountIn,
            _amountOut
        );
    }

    /**
     * @notice Deploy MET to yield generation strategy
     */
    function rebalance() external onlyOwner {}

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
     * @notice Set liquidator fee
     */
    function setLiquidatorFee(uint256 _liquidatorFee) public onlyOwner {
        liquidatorFee = _liquidatorFee;
    }
}
