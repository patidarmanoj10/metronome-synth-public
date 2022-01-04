// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/token/ERC20/ERC20.sol";
import "../interface/ISyntheticAsset.sol";

contract SyntheticAssetMock is ERC20, ISyntheticAsset {
    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 internal _interestRate;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 interestRate_
    ) ERC20(name_, symbol_) {
        _interestRate = interestRate_;
    }

    function isActive() external view returns (bool) {}

    function maxTotalSupplyInUsd() external view returns (uint256) {}

    function interestRate() external view returns (uint256) {}

    function interestRatePerBlock() external view returns (uint256) {
        return _interestRate / BLOCKS_PER_YEAR;
    }

    function debtToken() external view returns (IDebtToken) {}

    function collateralizationRatio() external view returns (uint256) {}

    function mint(address _to, uint256 amount) external {}

    function burn(address _from, uint256 amount) external {}

    function updateCollateralizationRatio(uint128 _newCollateralizationRatio) external {}

    function updateMaxTotalSupplyInUsd(uint256 _newMaxTotalSupply) external {}

    function toggleIsActive() external {}

    function updateInterestRate(uint256 _newInterestRate) external {
        _interestRate = _newInterestRate;
    }
}
