// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Address} from "./dependencies/openzeppelin/utils/Address.sol";
import {Initializable} from "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import {SafeERC20} from "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "./dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {EnumerableSet} from "./dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {SynthContext} from "./utils/SynthContext.sol";
import {IPoolRegistry} from "./interfaces/IPoolRegistry.sol";
import {ISyntheticToken} from "./interfaces/ISyntheticToken.sol";
import {IVPool} from "./interfaces/external/IVPool.sol";
import {AMOStorage} from "./storage/AMOStorage.sol";
import {Math} from "./dependencies/openzeppelin/utils/math/Math.sol";

/**
 * @title Automated Market Operator
 * @notice Operator will mint/burn SyntheticToken liquidity and deposit/withdraw to/from Vesper pool as needed.
 */
contract AMO is SynthContext, Initializable, AMOStorage {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISyntheticToken;
    using EnumerableSet for EnumerableSet.AddressSet;

    string public constant VERSION = "1.3.2";

    event MintAndDeposit(ISyntheticToken indexed syntheticToken, IVPool indexed vPool, uint256 amountDeposited);
    event WithdrawAndBurn(ISyntheticToken indexed syntheticToken, IVPool indexed vPool, uint256 amountBurnt);
    event Harvest(ISyntheticToken indexed syntheticToken, IVPool indexed vPool, uint256 profit);
    event KeeperUpdated(address indexed keeper, string indexed ops);
    event VesperPoolUpdated(ISyntheticToken indexed syntheticToken, IVPool indexed vPool);

    error AddressIsNull();
    error CallerIsNotAuthorized();
    error SyntheticTokenDoesNotMatch();
    error AmountIsZero();
    error CallerIsNotGovernor();
    error VesperPoolIsNotAllowed();
    error AmountToBurnGreaterThanAmoSupply();

    modifier onlyAuthorized() {
        address _msgSender = _msgSender();
        if (!isKeeper(_msgSender) && _msgSender != governor()) revert CallerIsNotAuthorized();
        _;
    }

    modifier onlyGovernor() {
        if (_msgSender() != governor()) revert CallerIsNotGovernor();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(IPoolRegistry poolRegistry_) public initializer {
        if (address(poolRegistry_) == address(0)) revert AddressIsNull();

        _poolRegistry = poolRegistry_;
    }

    /**
     * @notice Only 'authorized' role can call this function.
     * It will mint `amount_` from `syntheticToken_` token and deposit those into `vPool_`.
     * @param syntheticToken_ Synthetic Token Address
     * @param vPool_ Vesper pool address where Synthetic token is defined as collateral.
     * @param amount_ Amount in Synthetic token
     */
    function mintAndDeposit(ISyntheticToken syntheticToken_, IVPool vPool_, uint256 amount_) external onlyAuthorized {
        if (amount_ == 0) revert AmountIsZero();
        if (vPools[address(syntheticToken_)] != address(vPool_)) revert VesperPoolIsNotAllowed();

        // 1. Mint Synth here
        syntheticToken_.mint(address(this), amount_);

        // 2. Deposit minted Synth in Vesper pool
        syntheticToken_.safeApprove(address(vPool_), 0);
        syntheticToken_.safeApprove(address(vPool_), amount_);
        vPool_.deposit(amount_);

        emit MintAndDeposit(syntheticToken_, vPool_, amount_);
    }

    /**
     * @notice Only 'authorized' role can call this function.
     * It will calculate `_shares` from `amount_` and withdraw `_shares` from `vPool_` and
     * burn amount of Synthetic token withdrawn from Vesper.
     * @param syntheticToken_ Synthetic Token Address
     * @param vPool_ Vesper pool address where Synthetic token is defined as collateral.
     * @param amount_ Amount in Synthetic token
     */
    function withdrawAndBurn(ISyntheticToken syntheticToken_, IVPool vPool_, uint256 amount_) external onlyAuthorized {
        if (amount_ == 0) revert AmountIsZero();
        if (vPools[address(syntheticToken_)] != address(vPool_)) revert VesperPoolIsNotAllowed();

        // 1. Calculate shares to withdraw
        uint256 _shares = Math.min((amount_ * 1e18) / vPool_.pricePerShare(), vPool_.balanceOf(address(this)));

        // 2. Withdraw synth from Vesper pool
        uint256 _amountToBurn = _withdrawFromVesper(syntheticToken_, vPool_, _shares);
        if (_amountToBurn > syntheticToken_.amoSupply()) revert AmountToBurnGreaterThanAmoSupply();

        // 3. Burn synth withdrawn from Vesper pool
        syntheticToken_.burn(address(this), _amountToBurn);

        emit WithdrawAndBurn(syntheticToken_, vPool_, _amountToBurn);
    }

    /**
     * @notice Only 'authorized' role can call this function.
     * It will calculate profit, withdraw profit from Vesper pool and transfer profit to governor.
     * @param syntheticToken_ Synthetic token address
     * @param vPool_ Vesper pool address where Synthetic token is defined as collateral.
     */
    function harvest(ISyntheticToken syntheticToken_, IVPool vPool_) external onlyAuthorized {
        if (vPools[address(syntheticToken_)] != address(vPool_)) revert VesperPoolIsNotAllowed();

        // 1. Calculate profit in Synth
        uint256 _synthInPool = (vPool_.balanceOf(address(this)) * vPool_.pricePerShare()) / 1e18;
        uint256 _synthDeposited = syntheticToken_.amoSupply();
        uint256 _profit = _synthInPool > _synthDeposited ? _synthInPool - _synthDeposited : 0;

        if (_profit > 0) {
            // 2. Calculate profit in Vesper pool shares
            uint256 _profitInShare = (_profit * 1e18) / vPool_.pricePerShare();

            // 3. Withdraw profit from Vesper pool
            uint256 _actualProfit = _withdrawFromVesper(syntheticToken_, vPool_, _profitInShare);

            // 4. Transfer profit to governor
            syntheticToken_.transfer(governor(), _actualProfit);
            emit Harvest(syntheticToken_, vPool_, _actualProfit);
        }
    }

    function _withdrawFromVesper(
        ISyntheticToken syntheticToken_,
        IVPool vPool_,
        uint256 shares_
    ) private returns (uint256) {
        // Vesper pool may withdraw less, of course burn less shares too, than requested.
        // Hence the difference of Synth balance after withdraw and before withdraw is actual Synth withdrawn.
        uint256 _before = syntheticToken_.balanceOf(address(this));
        vPool_.withdraw(shares_);
        return syntheticToken_.balanceOf(address(this)) - _before;
    }

    /// @inheritdoc SynthContext
    function poolRegistry() public view override returns (IPoolRegistry) {
        return _poolRegistry;
    }

    /**
     * @notice Governor of this contract is same as PoolRegistry governor.
     * Governor can perform all authorized actions.
     */
    function governor() public view returns (address) {
        return _poolRegistry.governor();
    }

    /**
     * @notice List of keepers. Keeper can perform all authorized actions.
     */
    function getKeepers() external view returns (address[] memory) {
        return keepers.values();
    }

    /**
     * @notice Returns whether given address is keeper or not.
     * @param user_ User address to check
     */
    function isKeeper(address user_) public view returns (bool) {
        return keepers.contains(user_);
    }

    /**
     * @notice ERC20 recovery in case of stuck tokens due direct transfers to the contract address.
     * @param token_ The token to transfer
     * @param amount_ The amount to send
     */
    function sweep(IERC20 token_, uint256 amount_) external onlyGovernor {
        if (amount_ == 0) revert AmountIsZero();

        if (address(token_) == address(0)) {
            Address.sendValue(payable(governor()), amount_);
        } else {
            token_.safeTransfer(governor(), amount_);
        }
    }

    /**
     * @notice Only 'governor' role can call this function.
     * This function will remove keeper_ if already exist in list else add in list.
     * @param keeper_ Keeper address to add/remove.
     */
    function updateKeeper(address keeper_) external onlyGovernor {
        if (keepers.contains(keeper_)) {
            keepers.remove(keeper_);
            emit KeeperUpdated(keeper_, "remove");
        } else {
            keepers.add(keeper_);
            emit KeeperUpdated(keeper_, "add");
        }
    }

    /**
     * @notice Only 'governor' role can call this function.
     * This function will set a `vPool_` allowed to receive funds for a given synthetic asset
     * @param syntheticToken_ The Synthetic token
     * @param vPool_ The Vesper Pool allowed
     */
    function updateVesperPool(ISyntheticToken syntheticToken_, IVPool vPool_) external onlyGovernor {
        if (address(vPool_) != address(0) && vPool_.token() != address(syntheticToken_))
            revert SyntheticTokenDoesNotMatch();

        vPools[address(syntheticToken_)] = address(vPool_);

        emit VesperPoolUpdated(syntheticToken_, vPool_);
    }
}
