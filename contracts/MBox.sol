// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/ISyntheticAsset.sol";
import "./interface/IOracle.sol";
import "./interface/ICollateral.sol";

/**
 * @title mBOX main contract
 */
contract MBox is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Represents MET collateral deposits (mBOX-MET token)
    ICollateral public collateral;

    /**
     * @notice Collateral (MET)
     * @dev For now, we only support MET as collateral
     */
    IERC20 public met;

    /// @notice Synthetics' underlying assets  oracle
    IOracle public oracle;

    /**
     * @notice mEth synthetic asset
     * @dev Can't be removed
     */
    ISyntheticAsset public mEth;

    /// @notice Avaliable synthetic assets
    ISyntheticAsset[] public availableSyntheticAssets;
    mapping(address => ISyntheticAsset) public syntheticAssetsByAddress;

    event CollateralDeposited(address indexed account, uint256 amount);
    event CollateralMinted(address indexed account, uint256 amount);
    event SyntheticAssetAdded(address indexed syntheticAsset);
    event SyntheticAssetRemoved(address indexed syntheticAsset);

    constructor(
        IERC20 _met,
        ISyntheticAsset _mETH,
        ICollateral _collateral,
        IOracle _oracle
    ) {
        require(address(_met) != address(0), "met-address-is-null");
        met = _met;
        mEth = _mETH;
        collateral = _collateral;
        oracle = _oracle;
    }

    modifier onlyIfSyntheticAssetExists(ISyntheticAsset _syntheticAsset) {
        require(
            address(syntheticAssetsByAddress[address(_syntheticAsset)]) != address(0),
            "synthetic-asset-does-not-exists"
        );
        _;
    }

    /// @notice Deposit MET as colleteral and mint mBOX-MET (tokenized deposit position)
    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "zero-collateral-amount");
        address _from = _msgSender();
        met.safeTransferFrom(_from, address(this), _amount);
        collateral.mint(_from, _amount);
        emit CollateralDeposited(_from, _amount);
    }

    /// @notice Burn mBOX-MET and withdraw MET
    function withdraw(uint256 _amount) external nonReentrant {}

    /// @notice Get debt report from an account
    function _issuanceReportOf(address _account, ISyntheticAsset _syntheticAsset)
        private
        returns (
            uint256 _maxIssuable,
            uint256 _maxIssuableInUsd,
            uint256 _freeCollateral,
            uint256 _lockedCollateral,
            uint256 _totalCollateral
        )
    {
        _freeCollateral = collateral.freeBalanceOf(_account);
        _lockedCollateral = collateral.lockedBalanceOf(_account);
        _totalCollateral = collateral.balanceOf(_account);
        _maxIssuableInUsd =
            (oracle.convertToUSD(address(met), _freeCollateral) * 1e18) /
            _syntheticAsset.collateralizationRatio();
        _maxIssuable = oracle.convertFromUSD(_syntheticAsset.underlyingAsset(), _maxIssuableInUsd);
    }

    /// @notice Lock mBOX-MET and mint synthetic asset
    function mint(ISyntheticAsset _syntheticAsset, uint256 _amount)
        public
        onlyIfSyntheticAssetExists(_syntheticAsset)
        nonReentrant
    {
        require(_amount > 0, "zero-synthetic-amount");

        address _from = _msgSender();

        (uint256 _maxIssuable, , , , ) = _issuanceReportOf(_from, _syntheticAsset);

        require(_amount <= _maxIssuable, "not-enough-collateral");

        uint256 _collateralToLock = (oracle.convert(_syntheticAsset.underlyingAsset(), address(met), _amount) *
            _syntheticAsset.collateralizationRatio()) / 1e18;

        collateral.lock(_from, _collateralToLock);

        _syntheticAsset.mint(_from, _amount);

        emit CollateralMinted(_from, _amount);
    }

    /// @notice Unlock mBOX-MET and burn mEth
    function repay(uint256 _amount) external nonReentrant {}

    /// @notice Burn mEth, unlock mBOX-MET and send liquidator fee
    function liquidate(address _account, uint256 _amountToRepay) external nonReentrant {}

    /// @notice Deploy MET to yield generation strategy
    function rebalance() external onlyOwner {}

    /// @notice Add synthetic token to mBOX offerings
    function addSyntheticAsset(ISyntheticAsset _synthetic) public onlyOwner {
        address _syntheticAddress = address(_synthetic);
        require(_syntheticAddress != address(0), "address-is-null");
        require(address(syntheticAssetsByAddress[_syntheticAddress]) == address(0), "synthetic-asset-exists");

        availableSyntheticAssets.push(_synthetic);
        syntheticAssetsByAddress[_syntheticAddress] = _synthetic;

        emit SyntheticAssetAdded(_syntheticAddress);
    }

    /// @notice Remove synthetic token from mBOX offerings
    function removeSyntheticAsset(ISyntheticAsset _synthetic) public onlyOwner onlyIfSyntheticAssetExists(_synthetic) {
        require(_synthetic.totalSupply() == 0, "synthetic-asset-with-supply");
        require(_synthetic != mEth, "can-not-remove-meth");

        address _syntheticAddress = address(_synthetic);

        for (uint256 i = 0; i < availableSyntheticAssets.length; i++) {
            if (availableSyntheticAssets[i] == _synthetic) {
                delete availableSyntheticAssets[i];

                // Copy the last mAsset into the place of the one we just deleted
                // If there's only one mAsset, this is availableSyntheticAssets[0] = availableSyntheticAssets[0]
                availableSyntheticAssets[i] = availableSyntheticAssets[availableSyntheticAssets.length - 1];

                // Decrease the size of the array by one
                availableSyntheticAssets.pop();

                break;
            }
        }

        delete syntheticAssetsByAddress[_syntheticAddress];

        emit SyntheticAssetRemoved(_syntheticAddress);
    }
}
