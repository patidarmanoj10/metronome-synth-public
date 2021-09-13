// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/ISyntheticAsset.sol";
import "./interface/IDebt.sol";

/// @title Synthetic Asset contract
contract SyntheticAsset is ERC20, Ownable, ISyntheticAsset {
    /// @notice Synthetic underlying asset
    address public override underlyingAsset;

    /// @notice Non-transferable token that represents users' debts
    IDebt public override debtToken;

    /// @notice Collaterization ration for the synthetic asset
    /// @dev Use 18 decimals (e.g. 15e17 = 150%)
    uint256 public override collateralizationRatio;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlyingAsset,
        IDebt _debtToken,
        uint256 _collateralizationRatio
    ) ERC20(_name, _symbol) {
        underlyingAsset = _underlyingAsset;
        debtToken = _debtToken;
        setCollateralizationRatio(_collateralizationRatio);
    }

    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    function setCollateralizationRatio(uint256 _newCollateralizationRatio) public override onlyOwner {
        require(_newCollateralizationRatio >= 1e18, "collaterization-ratio-lt-100%");
        collateralizationRatio = _newCollateralizationRatio;
    }
}
