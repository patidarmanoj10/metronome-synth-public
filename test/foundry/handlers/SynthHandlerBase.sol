// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./HandlerBase.sol";
import {IPool} from "../../../contracts/Pool.sol";
import {MasterOracleMock} from "../../../contracts/mock/MasterOracleMock.sol";

contract SynthHandlerBase is HandlerBase {
    uint256 internal constant MAX_FEE = 0.25e18;

    // Note: Sequence of mintings and/or interest accrual may reach max supply if amounts are large
    uint256 internal constant DEFAULT_AMOUNT = 1000e18;

    // Note: Not using large prices to avoid overflow (e.g. totalDebt = amount * synthPrice)
    uint256 internal constant MAX_PRICE = 10000e18;

    IPool internal pool;
    address internal governor;
    MasterOracleMock internal masterOracle;

    modifier useGovernor() {
        vm.startPrank(governor);
        _;
        vm.stopPrank();
    }

    modifier usePool() {
        vm.stopPrank();
        vm.startPrank(address(pool));
        _;
        // Note: Not stopping here because `usePool` is always used combined with `useActor`
        // vm.stopPrank();
    }

    constructor(IPool pool_) {
        pool = pool_;
        if (address(pool_) != address(0)) {
            governor = pool_.governor();
            masterOracle = MasterOracleMock(address(pool.poolRegistry().masterOracle()));
        }
    }

    function updatePrice(address asset, uint256 price) internal {
        price = bound(price, 0.01e18, MAX_PRICE);

        masterOracle.updatePrice(asset, price);
    }
}
