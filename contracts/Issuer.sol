// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./access/Manageable.sol";
import "./interface/IIssuer.sol";
import "./interface/IMBox.sol";
import "./lib/WadRayMath.sol";
import "./interface/ITreasury.sol";

contract IssuerStorageV1 {
    /**
     * @notice Prices oracle
     */
    IOracle public oracle;

    /**
     * @notice Represents collateral's deposits (i.e. mBOX-MET token)
     * @dev For now, we only use depositTokens[0]
     */
    IDepositToken[] public depositTokens;

    /**
     * @notice Avaliable synthetic assets
     * @dev The syntheticAssets[0] is mETH
     */
    ISyntheticAsset[] public syntheticAssets;
    mapping(address => ISyntheticAsset) public syntheticAssetByAddress;
}

/**
 * @title Issuer main contract
 */
contract Issuer is IIssuer, ReentrancyGuard, Manageable, IssuerStorageV1 {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when synthetic asset is enabled
    event SyntheticAssetAdded(ISyntheticAsset indexed syntheticAsset);

    /// @notice Emitted when synthetic asset is disabled
    event SyntheticAssetRemoved(ISyntheticAsset indexed syntheticAsset);

    /// @notice Emitted when deposit token contract is updated
    event DepositTokenUpdated(IDepositToken indexed oldDepositToken, IDepositToken indexed newDepositToken);

    /// @notice Emitted when oracle contract is updated
    event OracleUpdated(IOracle indexed oldOracle, IOracle indexed newOracle);

    /**
     * @dev Throws if synthetic asset isn't enabled
     */
    modifier onlyIfSyntheticAssetExists(ISyntheticAsset _syntheticAsset) {
        require(isSyntheticAssetExists(_syntheticAsset), "synthetic-asset-does-not-exists");
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

        if (depositToken().balanceOf(_account) > 0) {
            oracle.update(met());
        }
        _;
    }

    /**
     * @dev Update a specific asset's price (also updates the MET price)
     */
    modifier updatePriceOfAsset(ISyntheticAsset _syntheticAsset) {
        oracle.update(_syntheticAsset);
        oracle.update(met());
        _;
    }

    function initialize(
        IDepositToken depositToken_,
        ISyntheticAsset mETH_,
        IOracle oracle_,
        IMBox mBox_
    ) public initializer {
        require(address(depositToken_) != address(0), "deposit-token-is-null");
        require(address(oracle_) != address(0), "oracle-is-null");

        __ReentrancyGuard_init();
        __Manageable_init();

        setMBox(mBox_);

        depositTokens.push(depositToken_);
        oracle = oracle_;

        // Ensuring that mETH is the syntheticAssets[0]
        addSyntheticAsset(mETH_);
    }

    /**
     * @notice Get MET deposit token
     * @dev We have an array to have storage prepared to support other collaterals in future if we want
     */
    function depositToken() public view override returns (IDepositToken) {
        return depositTokens[0];
    }

    /**
     * @notice Get MET
     */
    function met() public view override returns (IERC20) {
        return depositToken().underlying();
    }

    /**
     * @notice Get the mETH synthetic asset (can't be removed)
     */
    function mEth() public view override returns (ISyntheticAsset) {
        return syntheticAssets[0];
    }

    /**
     * @notice Check if token is part of the offerings
     * @param _syntheticAsset Asset to check
     * @return true if exist
     */
    function isSyntheticAssetExists(ISyntheticAsset _syntheticAsset) public view returns (bool) {
        return syntheticAssetByAddress[address(_syntheticAsset)] != ISyntheticAsset(address(0));
    }

    /**
     * @notice Get account's synthetic assets that user has debt accounted in (i.e. synthetic assets that the user has minted)
     * @dev This is a helper function for external users (e.g. liquidators)
     * @dev This function is not used internally because its cost is twice against simply sweep all synthetic assets
     * @dev We could replace this by having such a list and update it whenever a debt token is minted or burned,
     * but right now - with small amount of synthetic assets - the overhead cost and code complexity wouldn't payoff.
     */
    function syntheticAssetsMintedBy(address _account)
        external
        view
        override
        returns (ISyntheticAsset[] memory _syntheticAssets)
    {
        uint256 _length = 0;

        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            if (syntheticAssets[i].debtToken().balanceOf(_account) > 0) {
                _length++;
            }
        }

        _syntheticAssets = new ISyntheticAsset[](_length);

        for (uint256 i = 0; i < syntheticAssets.length; ++i) {
            if (syntheticAssets[i].debtToken().balanceOf(_account) > 0) {
                _syntheticAssets[--_length] = syntheticAssets[i];
            }
        }
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
        _deposit = depositToken().balanceOf(_account);
        (_depositInUsd, _depositPriceInvalid) = oracle.convertToUsdUsingLatestPrice(met(), _deposit);

        _lockedDeposit = (_deposit * _lockedDepositInUsd) / _depositInUsd;

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
        external
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
     * @dev This function will revert if any price from oracle is invalid
     * @param _account The account to check
     * @param _syntheticAsset The synthetic asset to check issuance
     * @return _maxIssuable The max issuable amount
     */
    function maxIssuableFor(address _account, ISyntheticAsset _syntheticAsset)
        external
        override
        onlyIfSyntheticAssetExists(_syntheticAsset)
        updatePriceOfAsset(_syntheticAsset)
        updatePricesOfAssetsUsedBy(_account)
        returns (uint256 _maxIssuable)
    {
        bool _anyPriceInvalid;
        (_maxIssuable, _anyPriceInvalid) = maxIssuableForUsingLatestPrices(_account, _syntheticAsset);
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
            met(),
            _syntheticAsset,
            _unlockedDeposit.wadDiv(_syntheticAsset.collateralizationRatio())
        );
    }

    /**
     * @notice Mint synthetic asset and it's debt representation
     * @dev All use cases mint both tokens for the same account
     * @param _syntheticAsset The synthetic asset to mint
     * @param _to The destination account
     * @param _amount The amount to mint
     */
    function mintSyntheticAssetAndDebtToken(
        ISyntheticAsset _syntheticAsset,
        address _to,
        uint256 _amount
    ) external nonReentrant onlyMBox {
        require(_amount > 0, "amount-to-mint-is-zero");
        _syntheticAsset.mint(_to, _amount);
        _syntheticAsset.debtToken().mint(_to, _amount);
    }

    /**
     * @notice Burn synthetic asset and it's debt representation
     * @dev The liquidate feature needs accounts differentiation
     * @param _syntheticAsset The synthetic asset to mint
     * @param _syntheticAssetFrom The account to burn synthetic assets from
     * @param _debtTokenFrom The account to burn debt tokens from
     * @param _amount The amount to mint
     */
    function burnSyntheticAssetAndDebtToken(
        ISyntheticAsset _syntheticAsset,
        address _syntheticAssetFrom,
        address _debtTokenFrom,
        uint256 _amount
    ) external override nonReentrant onlyMBox {
        require(_amount > 0, "amount-to-burn-is-zero");
        require(_amount <= _syntheticAsset.debtToken().balanceOf(_debtTokenFrom), "amount-gt-burnable-debt");
        require(_amount <= _syntheticAsset.balanceOf(_syntheticAssetFrom), "amount-gt-burnable-synthetic");
        _syntheticAsset.burn(_syntheticAssetFrom, _amount);
        _syntheticAsset.debtToken().burn(_debtTokenFrom, _amount);
    }

    /**
     * @notice Mint deposit token
     * @param _to The synthetic asset to mint
     * @param _amount The account to burn synthetic assets from
     */
    function mintDepositToken(address _to, uint256 _amount) external override nonReentrant onlyMBox {
        require(_amount > 0, "amount-to-mint-is-zero");
        depositToken().mint(_to, _amount);
    }

    /**
     * @notice Collect fee from user
     * @dev Our approach is to burning deposit tokens (that represent real MET),
     * that way, `totalFeesCollected = MET.supply() - depositToken.supply()`
     * @param _account The account to charge from
     * @param _fee The amount to collect
     * @param _onlyFromUnlocked If true, we only collect from unlocked balance
     */
    function collectFee(
        address _account,
        uint256 _fee,
        bool _onlyFromUnlocked
    ) external override nonReentrant onlyMBox {
        require(_fee > 0, "fee-to-collect-is-zero");
        if (_onlyFromUnlocked) {
            depositToken().burnFromUnlocked(_account, _fee);
        } else {
            // Liquidate feature requires burn even from locked balance
            depositToken().burn(_account, _fee);
        }
    }

    /**
     * @notice Burn deposit token as part of withdraw process
     * @dev The `DepositToken` checks some constraints to validate withdraw
     * @param _account The account to burn from
     * @param _amount The amount to burn
     */
    function burnWithdrawnDeposit(address _account, uint256 _amount) external override nonReentrant onlyMBox {
        require(_amount > 0, "amount-to-burn-is-zero");
        depositToken().burnForWithdraw(_account, _amount);
    }

    /**
     * @notice Seize deposit tokens from a user
     * @param _from The account to seize from
     * @param _to The account to transfer to
     * @param _amount The amount to seize
     */
    function seizeDepositToken(
        address _from,
        address _to,
        uint256 _amount
    ) external override nonReentrant onlyMBox {
        require(_from != _to, "seize-from-and-to-are-the-same");
        require(_amount > 0, "amount-to-seize-is-zero");
        depositToken().seize(_from, _to, _amount);
    }

    /**
     * @notice Add synthetic token to mBOX offerings
     */
    function addSyntheticAsset(ISyntheticAsset _syntheticAsset) public override onlyGovernor {
        address _address = address(_syntheticAsset);

        require(_address != address(0), "address-is-null");
        require(address(syntheticAssetByAddress[_address]) == address(0), "synthetic-asset-exists");

        syntheticAssets.push(_syntheticAsset);
        syntheticAssetByAddress[_address] = _syntheticAsset;

        emit SyntheticAssetAdded(_syntheticAsset);
    }

    /**
     * @notice Remove synthetic token from mBOX offerings
     */
    function removeSyntheticAsset(ISyntheticAsset _syntheticAsset)
        external
        override
        onlyGovernor
        onlyIfSyntheticAssetExists(_syntheticAsset)
    {
        require(_syntheticAsset != mEth(), "can-not-delete-meth");
        require(_syntheticAsset.totalSupply() == 0, "synthetic-asset-with-supply");
        require(_syntheticAsset.debtToken().totalSupply() == 0, "synthetic-asset-with-debt-supply");

        for (uint256 i = 0; i < syntheticAssets.length; i++) {
            if (syntheticAssets[i] == _syntheticAsset) {
                // Using the last to overwrite the synthetic asset to remove
                syntheticAssets[i] = syntheticAssets[syntheticAssets.length - 1];

                // Removing the last (and duplicated) synthetic asset
                syntheticAssets.pop();

                break;
            }
        }

        delete syntheticAssetByAddress[address(_syntheticAsset)];

        emit SyntheticAssetRemoved(_syntheticAsset);
    }

    /**
     * @notice Update deposit (mBOX-MET) contract
     */
    function updateDepositToken(IDepositToken _newDepositToken) public override onlyGovernor {
        require(address(_newDepositToken) != address(0), "deposit-token-address-is-null");
        require(_newDepositToken != depositToken(), "deposit-token-is-same-as-current");
        require(depositToken().totalSupply() == 0, "current-deposit-token-has-supply");

        emit DepositTokenUpdated(depositToken(), _newDepositToken);
        depositTokens[0] = _newDepositToken;
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
}
