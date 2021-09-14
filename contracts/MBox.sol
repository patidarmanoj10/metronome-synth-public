// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/ISyntheticAsset.sol";
import "./interface/IOracle.sol";
import "./interface/ICollateral.sol";
import "./interface/IMBox.sol";

/**
 * @title mBOX main contract
 */
contract MBox is Ownable, ReentrancyGuard, IMBox {
    using SafeERC20 for IERC20;

    /**
     * @notice Represents MET collateral deposits (mBOX-MET token)
     */
    ICollateral public collateral;

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
     * @notice Event emitted when collateral is deposited
     */
    event CollateralDeposited(address indexed account, uint256 amount);

    /**
     * @notice Event emitted when synthetic asset is minted
     */
    event SyntheticAssetMinted(address indexed account, uint256 amount);

    /**
     * @notice Event emitted when synthetic asset is enabled
     */
    event SyntheticAssetAdded(address indexed syntheticAsset);

    /**
     * @notice Event emitted when synthetic asset is disabled
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

        IERC20 met = IERC20(collateral.underlyingAsset());

        met.safeTransferFrom(_account, address(this), _amount);

        collateral.mint(_account, _amount);

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

                _debtInUsd += oracle.convertToUSD(syntheticAssets[i].underlyingAsset(), debtAmount);
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
        _lockedCollateral = oracle.convertFromUSD(collateral.underlyingAsset(), _debtInUsdWithCollateralizationRatio);
    }

    /**
     * @notice Get debt position from an account
     * @param _account The account to check
     * @return _debtInUsd The total debt (in USD) without consider collateralization ratio
     * @return _collateralInUsd The total collateral deposited (in USD)
     * @return _collateral The total collateral deposited
     * @return _freeCollateral The amount of collateral that isn't covering the user's debt
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
            uint256 _freeCollateral,
            uint256 _lockedCollateral
        )
    {
        _debtInUsd = _debtInUsdOf(_account, false);
        _collateral = collateral.balanceOf(_account);
        _collateralInUsd = oracle.convertToUSD(collateral.underlyingAsset(), _collateral);
        _lockedCollateral = _lockedCollateralOf(_account);
        _freeCollateral = _collateral - _lockedCollateral;
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
        (, , , uint256 _freeCollateral, ) = debtPositionOf(_account);

        uint256 _freeCollateralInUsd = oracle.convertToUSD(collateral.underlyingAsset(), _freeCollateral);

        uint256 _maxIssuableInUsd = (_freeCollateralInUsd * 1e18) / _syntheticAsset.collateralizationRatio();

        _maxIssuable = oracle.convertFromUSD(_syntheticAsset.underlyingAsset(), _maxIssuableInUsd);
    }

    /**
     * @notice Lock collateral and mint synthetic asset
     * @param _syntheticAsset The synthetic asset to mint
     * @param _amount The amount to mint
     */
    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount)
        public
        onlyIfSyntheticAssetExists(_syntheticAsset)
        nonReentrant
    {
        require(_amount > 0, "zero-synthetic-amount");

        address _account = _msgSender();

        uint256 _maxIssuable = maxIssuableFor(_account, _syntheticAsset);

        require(_amount <= _maxIssuable, "not-enough-collateral");

        _syntheticAsset.debtToken().mint(_account, _amount);

        _syntheticAsset.mint(_account, _amount);

        emit SyntheticAssetMinted(_account, _amount);
    }

    /**
     * @notice  @notice Burn mBOX-MET and withdraw MET
     */
    function withdraw(uint256 _amount) external nonReentrant {}

    /**
     * @notice Unlock mBOX-MET and burn mEth
     */
    function repay(uint256 _amount) external nonReentrant {}

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
    function setCollateral(ICollateral _collateral) public onlyOwner {
        collateral = _collateral;
    }

    /**
     * @notice Set price oracle contract
     */
    function setOracle(IOracle _oracle) public onlyOwner {
        oracle = _oracle;
    }
}
