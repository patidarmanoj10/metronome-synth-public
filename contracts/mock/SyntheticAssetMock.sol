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

    function isActive() external pure returns (bool) {
        revert("mock-does-not-implement");
    }

    function maxTotalSupplyInUsd() external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function interestRate() external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function interestRatePerBlock() external view returns (uint256) {
        return _interestRate / BLOCKS_PER_YEAR;
    }

    function debtToken() external pure returns (IDebtToken) {
        revert("mock-does-not-implement");
    }

    function collateralizationRatio() external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function mint(address, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function burn(address, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateCollateralizationRatio(uint128) external pure {
        revert("mock-does-not-implement");
    }

    function updateMaxTotalSupplyInUsd(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function toggleIsActive() external pure {
        revert("mock-does-not-implement");
    }

    function updateInterestRate(uint256 _newInterestRate) external {
        _interestRate = _newInterestRate;
    }

    function seize(
        address,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }
}
