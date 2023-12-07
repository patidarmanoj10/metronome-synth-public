// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {Test, console2} from "forge-std/Test.sol";
import {Pool} from "../../../contracts/Pool.sol";
import {IERC20Metadata, DepositToken} from "../../../contracts/DepositToken.sol";

interface IChainlinkOracle {
    function updateCustomStalePeriod(address, uint256) external;
}

interface IBloomPool is IERC20Metadata {
    enum State {
        Other,
        Commit,
        ReadyPreHoldSwap,
        PendingPreHoldSwap,
        Holding,
        ReadyPostHoldSwap,
        PendingPostHoldSwap,
        EmergencyExit,
        FinalWithdraw
    }

    function POOL_PHASE_END() external view returns (uint256);

    function state() external view returns (State);

    function getDistributionInfo()
        external
        view
        returns (
            uint128 borrowerDistribution,
            uint128 totalBorrowerShares,
            uint128 lenderDistribution,
            uint128 totalLenderShares
        );

    function UNDERLYING_TOKEN() external view returns (IERC20Metadata);
}

interface IMasterOracle {
    function updateTokenOracle(address token_, address oracle_) external;

    function getPriceInUsd(address token_) external view returns (uint256);
}

interface IExchangeRateRegistry {
    function getExchangeRate(address token) external view returns (uint256);
}

contract TBYOracle {
    uint256 public constant ONE_SHARE = 1e6;
    uint256 public constant ONE_USD = 1e18;

    IExchangeRateRegistry public immutable exchangeRateRegistry;

    constructor(IExchangeRateRegistry exchangeRateRegistry_) {
        exchangeRateRegistry = exchangeRateRegistry_;
    }

    /**
     * Note: Until the maturity, we use the exchange rate to calculate TBY price
     * When it enters the withdraw phase, exchange rate isn't accurate because:
     * 1) Interest rate may vary and that could impact TBY price even after the maturity
     * 2) After the maturity the actual TBY price is the redeemable USDC amount
     */
    function getPriceInUsd(address token_) external view returns (uint256) {
        IBloomPool _tby = IBloomPool(token_);
        IERC20Metadata _underlying = _tby.UNDERLYING_TOKEN(); // i.e., USDC
        IMasterOracle _masterOracle = IMasterOracle(msg.sender);
        uint256 _underlyingPrice = _masterOracle.getPriceInUsd(address(_underlying));

        if (_tby.state() == IBloomPool.State.FinalWithdraw) {
            (, , uint128 lenderDistribution, uint128 totalLenderShares) = _tby.getDistributionInfo();
            uint256 _underlyingAmountPerShare = (ONE_SHARE * lenderDistribution) / totalLenderShares;
            return (_underlyingPrice * _underlyingAmountPerShare) / _underlying.decimals();
        }

        return (_underlyingPrice * exchangeRateRegistry.getExchangeRate(token_)) / ONE_USD;
    }
}

contract TBY_Test is Test {
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address MASTER_ORACLE_GOVERNOR = 0x9520b477Aa81180E6DdC006Fc09Fb6d3eb4e807A;
    address SYNTH_GOVERNOR = 0xd1DE3F9CD4AE2F23DA941a67cA4C739f8dD9Af33;

    IExchangeRateRegistry tbyExchangeRateRegistry = IExchangeRateRegistry(0xBbBe37FE58e9859b6943AC53bDf4d0827f7F0034);
    IBloomPool tbyApr24 = IBloomPool(0x1338a5BdAFe2f0C2a847b04fd943A61787F046cD);
    Pool pool = Pool(payable(0x574a32f1047C631653D9283d36e73cF9BA67B940)); // Pool_2
    TBYOracle tbyOracle;
    IMasterOracle masterOracle = IMasterOracle(0x80704Acdf97723963263c78F861F091ad04F46E2);
    DepositToken tbyDepositToken;

    function setUp() public {
        vm.createSelectFork(vm.envString("NODE_URL"), 18_714_729);

        tbyOracle = new TBYOracle(tbyExchangeRateRegistry);

        vm.startPrank(MASTER_ORACLE_GOVERNOR);
        masterOracle.updateTokenOracle(address(tbyApr24), address(tbyOracle));
        IChainlinkOracle(0x0C102819074dA01f30360676F36b86c8be68A3E7).updateCustomStalePeriod(USDC, type(uint256).max);
        vm.stopPrank();

        tbyDepositToken = new DepositToken();
        vm.store(address(tbyDepositToken), bytes32(uint256(0)), bytes32(uint256(0))); // Undo initialization made by constructor
        tbyDepositToken.initialize(
            tbyApr24,
            pool,
            "TBY APR24 Deposit Token",
            "mdsTbyApr24",
            18,
            0.9e18,
            type(uint256).max
        );

        vm.prank(SYNTH_GOVERNOR);
        pool.addDepositToken(address(tbyDepositToken));
    }

    function test_oracle() public {
        uint256 currentPrice = masterOracle.getPriceInUsd(address(tbyApr24));
        assertApproxEqAbs(currentPrice, 1.004e18, 0.001e18, "On 12/04/23 1 TBY worths ~= $1.004");

        vm.warp(tbyApr24.POOL_PHASE_END());
        uint256 rateAtMaturity = tbyExchangeRateRegistry.getExchangeRate(address(tbyApr24));
        assertEq(rateAtMaturity, 1.02315e18); // 6mo 4.70 APY

        uint256 maturityPrice = masterOracle.getPriceInUsd(address(tbyApr24));
        assertApproxEqAbs(maturityPrice, 1.023e18, 0.001e18, "At maturity date 1 TBY should worth ~= $1.023");

        // Note: Rate may change due to its variation over time
        vm.warp(block.timestamp + 360 days);
        uint256 rateAYearAfterMaturity = tbyExchangeRateRegistry.getExchangeRate(address(tbyApr24));
        assertEq(rateAYearAfterMaturity, rateAtMaturity + 0.0002e18);
    }

    function test_pool() public {
        deal(address(tbyApr24), address(this), 1000e6);
        tbyApr24.approve(address(tbyDepositToken), type(uint256).max);
        tbyDepositToken.deposit(1000e6, address(this));

        (uint256 _depositsInUsd, ) = pool.depositOf(address(this));
        assertApproxEqAbs(_depositsInUsd, 1004e18, 1e18);
    }
}
