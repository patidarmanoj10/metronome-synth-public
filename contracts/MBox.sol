// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

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
     * @notice Represents MET collateral deposits (mBOX-MET token)
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
     * @notice Get total debt of a user in USD
     * @dev We can optimize this function by storing an array of which synthetics the user minted avoiding looping all
     * @param _account The account to check
     * @param _withCollateralizationRatio Whether should consider the total of collateralization of just the debt itself
     * @return _debtInUsd The debt value in USD
     */
    function _debtInUsdOf(address _account, bool _withCollateralizationRatio)
        private
        view
        returns (uint256 _debtInUsd)
    {
        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            uint256 debtAmount = syntheticAssets[i].debtToken().balanceOf(_account);

            if (debtAmount > 0) {
                if (_withCollateralizationRatio) {
                    debtAmount = (debtAmount * syntheticAssets[i].collateralizationRatio()) / 1e18;
                }

                _debtInUsd += oracle.convertToUSD(syntheticAssets[i].underlying(), debtAmount);
            }
        }
    }

    /**
     * @notice Get total amount of collateral that's covering the user's debt
     * @param _account The account to check
     * @return _lockedCollateral The amount of collateral token that's covering the user's debt
     */
    function _lockedCollateralOf(address _account) private view returns (uint256 _lockedCollateral) {
        uint256 _debtInUsdWithCollateralizationRatio = _debtInUsdOf(_account, true);
        _lockedCollateral = oracle.convertFromUSD(depositToken.underlying(), _debtInUsdWithCollateralizationRatio);
    }

    /**
     * @notice Get debt position from an account
     * @param _account The account to check
     * @return _debtInUsd The total debt (in USD) without consider collateralization ratio
     * @return _collateralInUsd The total collateral deposited (in USD)
     * @return _collateral The total collateral deposited
     * @return _unlockedCollateral The amount of collateral that isn't covering the user's debt
     * @return _lockedCollateral The amount of collateral that is covering the user's debt
     */
    function debtPositionOf(address _account)
        public
        view
        override
        returns (
            uint256 _debtInUsd,
            uint256 _collateralInUsd,
            uint256 _collateral,
            uint256 _unlockedCollateral,
            uint256 _lockedCollateral
        )
    {
        _debtInUsd = _debtInUsdOf(_account, false);
        _collateral = depositToken.balanceOf(_account);
        _collateralInUsd = oracle.convertToUSD(depositToken.underlying(), _collateral);
        _lockedCollateral = _lockedCollateralOf(_account);
        _unlockedCollateral = _collateral - _lockedCollateral;
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
        (, , , uint256 _unlockedCollateral, ) = debtPositionOf(_account);

        uint256 _unlockedCollateralInUsd = oracle.convertToUSD(depositToken.underlying(), _unlockedCollateral);

        uint256 _maxIssuableInUsd = (_unlockedCollateralInUsd * 1e18) / _syntheticAsset.collateralizationRatio();

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
     * @notice  @notice Burn mBOX-MET and withdraw MET
     */
    function withdraw(uint256 _amount) external nonReentrant {
        require(_amount > 0, "amount-to-withdraw-is-zero");

        address _account = _msgSender();

        (, , , uint256 _unlockedCollateral, ) = debtPositionOf(_account);

        require(_amount <= _unlockedCollateral, "amount-to-withdraw-gt-unlocked");

        depositToken.burn(_account, _amount);

        IERC20 met = IERC20(depositToken.underlying());

        met.safeTransfer(_account, _amount);

        emit CollateralWithdrawn(_account, _amount);
    }

    /**
     * @notice Unlock mBOX-MET and burn mEth
     */
    function repay(ISyntheticAsset _syntheticAsset, uint256 _amount)
        external
        onlyIfSyntheticAssetExists(_syntheticAsset)
        nonReentrant
    {
        require(_amount > 0, "amount-to-repay-is-zero");

        address _account = _msgSender();

        require(_amount <= _syntheticAsset.debtToken().balanceOf(_account), "amount-to-repay-gt-debt");

        _syntheticAsset.burn(_account, _amount);

        _syntheticAsset.debtToken().burn(_account, _amount);

        emit DebtRepayed(_account, address(_syntheticAsset), _amount);
    }

    /**
     * @notice Burn mEth, unlock mBOX-MET and send liquidator fee
     */
    function liquidate(address _account, uint256 _amountToRepay) external nonReentrant {}

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
     * @notice @notice Set collateral (mBOX-MET) contract
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
}
