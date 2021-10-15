// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../access/Governable.sol";
import "../interface/oracle/IUniswapV3CrossPoolOracle.sol";
import "../interface/oracle/IPriceProvider.sol";
import "../lib/OracleHelpers.sol";

contract PriceProviderMock is IPriceProvider {
    uint256 lastUpdatedAt;
    uint256 amount;
    uint256 amountInUsd;

    function setLastUpdatedAt(uint256 _lastUpdatedAt) public {
        lastUpdatedAt = _lastUpdatedAt;
    }

    function setAmount(uint256 _amount) public {
        amount = _amount;
    }

    function setAmountInUsd(uint256 _amountInUsd) public {
        amountInUsd = _amountInUsd;
    }

    function convertToUsd(bytes memory _encodedTokenAddress, uint256 _amount)
        external
        view
        override
        returns (uint256 _amountInUsd, uint256 _lastUpdatedAt)
    {
        _amountInUsd = amountInUsd;
        _lastUpdatedAt = lastUpdatedAt;
    }

    function convertFromUsd(bytes memory _encodedTokenAddress, uint256 _amountInUsd)
        external
        view
        override
        returns (uint256 _amount, uint256 _lastUpdatedAt)
    {
        _amount = amount;
        _lastUpdatedAt = lastUpdatedAt;
    }

    function update(bytes memory) external {}
}
