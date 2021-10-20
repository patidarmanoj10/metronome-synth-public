// SPDX-License-Identifier: MIT

pragma solidity >=0.6.2;

import "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";

library OracleHelpers {
    uint8 public constant USD_DECIMALS = 8;

    function normalizeUsdOutput(address _usdToken, uint256 _amountInUsd) internal view returns (uint256) {
        uint256 _usdTokenDecimals = IERC20Metadata(_usdToken).decimals();
        return normalizeUsdOutput(_usdTokenDecimals, _amountInUsd);
    }

    function normalizeUsdInput(address _usdToken, uint256 _amountInUsd) internal view returns (uint256) {
        uint256 _usdTokenDecimals = IERC20Metadata(_usdToken).decimals();
        return normalizeUsdInput(_usdTokenDecimals, _amountInUsd);
    }

    function normalizeUsdOutput(uint256 _usdTokenDecimals, uint256 _amountInUsd) internal pure returns (uint256) {
        if (_usdTokenDecimals >= USD_DECIMALS) {
            return _amountInUsd / 10**(_usdTokenDecimals - USD_DECIMALS);
        } else {
            return _amountInUsd * 10**(USD_DECIMALS - _usdTokenDecimals);
        }
    }

    function normalizeUsdInput(uint256 _usdTokenDecimals, uint256 _amountInUsd) internal pure returns (uint256) {
        if (_usdTokenDecimals >= USD_DECIMALS) {
            return _amountInUsd * 10**(_usdTokenDecimals - USD_DECIMALS);
        } else {
            return _amountInUsd / 10**(USD_DECIMALS - _usdTokenDecimals);
        }
    }
}
