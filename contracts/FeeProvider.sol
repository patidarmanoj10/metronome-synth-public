// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Initializable} from "./dependencies/openzeppelin-upgradeable/proxy/utils/Initializable.sol";
import {SynthContext} from "./utils/SynthContext.sol";
import {FeeProviderStorageV2} from "./storage/FeeProviderStorage.sol";
import {IPoolRegistry} from "./interfaces/IPoolRegistry.sol";
import {IESMET} from "./interfaces/external/IESMET.sol";
import {WadRayMath} from "./lib/WadRayMath.sol";

error SenderIsNotGovernor();
error PoolRegistryIsNull();
error NewValueIsSameAsCurrent();
error FeeIsGreaterThanTheMax();

/**
 * @title FeeProvider contract
 */
contract FeeProvider is SynthContext, Initializable, FeeProviderStorageV2 {
    using WadRayMath for uint256;

    string public constant VERSION = "1.3.2";

    uint256 internal constant MAX_FEE_VALUE = 0.25e18; // 25%

    /// @notice Emitted when deposit fee is updated
    event DepositFeeUpdated(uint256 oldDepositFee, uint256 newDepositFee);

    /// @notice Emitted when issue fee is updated
    event IssueFeeUpdated(uint256 oldIssueFee, uint256 newIssueFee);

    /// @notice Emitted when liquidator incentive is updated
    event LiquidatorIncentiveUpdated(uint256 oldLiquidatorIncentive, uint256 newLiquidatorIncentive);

    /// @notice Emitted when protocol liquidation fee is updated
    event ProtocolLiquidationFeeUpdated(uint256 oldProtocolLiquidationFee, uint256 newProtocolLiquidationFee);

    /// @notice Emitted when repay fee is updated
    event RepayFeeUpdated(uint256 oldRepayFee, uint256 newRepayFee);

    /// @notice Emitted when swap fee is updated
    event SwapFeeUpdated(address synthIn, address synthOut, uint256 oldSwapFee, uint256 newSwapFee);

    /// @notice Emitted when withdraw fee is updated
    event WithdrawFeeUpdated(uint256 oldWithdrawFee, uint256 newWithdrawFee);

    /**
     * @notice Throws if caller isn't the governor
     */
    modifier onlyGovernor() {
        if (_msgSender() != _poolRegistry.governor()) revert SenderIsNotGovernor();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(IPoolRegistry poolRegistry_, IESMET esMET_) public initializer {
        if (address(poolRegistry_) == address(0)) revert PoolRegistryIsNull();

        _poolRegistry = poolRegistry_;
        esMET = esMET_;

        liquidationFees = LiquidationFees({
            liquidatorIncentive: 1e17, // 10%
            protocolFee: 8e16 // 8%
        });
    }

    /// @inheritdoc SynthContext
    function poolRegistry() public view override returns (IPoolRegistry) {
        return _poolRegistry;
    }

    /**
     * @notice Update deposit fee
     */
    function updateDepositFee(uint256 newDepositFee_) external onlyGovernor {
        if (newDepositFee_ > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        uint256 _currentDepositFee = depositFee;
        if (newDepositFee_ == _currentDepositFee) revert NewValueIsSameAsCurrent();
        emit DepositFeeUpdated(_currentDepositFee, newDepositFee_);
        depositFee = newDepositFee_;
    }

    /**
     * @notice Update issue fee
     */
    function updateIssueFee(uint256 newIssueFee_) external onlyGovernor {
        if (newIssueFee_ > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        uint256 _currentIssueFee = issueFee;
        if (newIssueFee_ == _currentIssueFee) revert NewValueIsSameAsCurrent();
        emit IssueFeeUpdated(_currentIssueFee, newIssueFee_);
        issueFee = newIssueFee_;
    }

    /**
     * @notice Update liquidator incentive
     * @dev liquidatorIncentive + protocolFee can't surpass max
     */
    function updateLiquidatorIncentive(uint128 newLiquidatorIncentive_) external onlyGovernor {
        LiquidationFees memory _current = liquidationFees;
        if (newLiquidatorIncentive_ + _current.protocolFee > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        if (newLiquidatorIncentive_ == _current.liquidatorIncentive) revert NewValueIsSameAsCurrent();
        emit LiquidatorIncentiveUpdated(_current.liquidatorIncentive, newLiquidatorIncentive_);
        liquidationFees.liquidatorIncentive = newLiquidatorIncentive_;
    }

    /**
     * @notice Update protocol liquidation fee
     * @dev liquidatorIncentive + protocolFee can't surpass max
     */
    function updateProtocolLiquidationFee(uint128 newProtocolLiquidationFee_) external onlyGovernor {
        LiquidationFees memory _current = liquidationFees;
        if (newProtocolLiquidationFee_ + _current.liquidatorIncentive > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        if (newProtocolLiquidationFee_ == _current.protocolFee) revert NewValueIsSameAsCurrent();
        emit ProtocolLiquidationFeeUpdated(_current.protocolFee, newProtocolLiquidationFee_);
        liquidationFees.protocolFee = newProtocolLiquidationFee_;
    }

    /**
     * @notice Update repay fee
     */
    function updateRepayFee(uint256 newRepayFee_) external onlyGovernor {
        if (newRepayFee_ > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        uint256 _currentRepayFee = repayFee;
        if (newRepayFee_ == _currentRepayFee) revert NewValueIsSameAsCurrent();
        emit RepayFeeUpdated(_currentRepayFee, newRepayFee_);
        repayFee = newRepayFee_;
    }

    /**
     * @notice Update swap fee
     */
    function updateSwapFee(address synthIn_, address synthOut_, uint256 newSwapFee_) external onlyGovernor {
        if (newSwapFee_ > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        uint256 _current = swapFees[synthIn_][synthOut_];
        if (newSwapFee_ == _current) revert NewValueIsSameAsCurrent();
        emit SwapFeeUpdated(synthIn_, synthOut_, _current, newSwapFee_);
        swapFees[synthIn_][synthOut_] = newSwapFee_;
    }

    /**
     * @notice Update withdraw fee
     */
    function updateWithdrawFee(uint256 newWithdrawFee_) external onlyGovernor {
        if (newWithdrawFee_ > MAX_FEE_VALUE) revert FeeIsGreaterThanTheMax();
        uint256 _currentWithdrawFee = withdrawFee;
        if (newWithdrawFee_ == _currentWithdrawFee) revert NewValueIsSameAsCurrent();
        emit WithdrawFeeUpdated(_currentWithdrawFee, newWithdrawFee_);
        withdrawFee = newWithdrawFee_;
    }
}
