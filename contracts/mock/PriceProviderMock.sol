// SPDX-License-Identifier: MIT

// solhint-disable state-visibility
// solhint-disable no-unused-vars
// solhint-disable no-empty-blocks

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

    function convertToUsd(bytes memory, uint256)
        external
        view
        override
        returns (uint256 _amountInUsd, uint256 _lastUpdatedAt)
    {
        _amountInUsd = amountInUsd;
        _lastUpdatedAt = lastUpdatedAt;
    }

    function convertFromUsd(bytes memory, uint256)
        external
        view
        override
        returns (uint256 _amount, uint256 _lastUpdatedAt)
    {
        _amount = amount;
        _lastUpdatedAt = lastUpdatedAt;
    }

    function update(bytes memory) external {}

    function convert(
        bytes memory _assetInData,
        bytes memory _assetOutData,
        uint256 _amountIn
    ) external view returns (uint256 _amountOut, uint256 _lastUpdatedAt) {}
}
