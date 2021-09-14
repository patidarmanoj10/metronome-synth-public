// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/ISyntheticAsset.sol";
import "./interface/IDebtToken.sol";

/**
 * @title Synthetic Asset contract
 */
contract SyntheticAsset is ERC20, Ownable, ISyntheticAsset {
    /**
     * @notice Synthetic underlying asset
     */
    address public override underlying;

    /**
     * @notice Non-transferable token that represents users' debts
     */
    IDebtToken public override debtToken;

    /**
     * @notice Collaterization ration for the synthetic asset
     * @dev Use 18 decimals (e.g. 15e17 = 150%)
     */
    uint256 public override collateralizationRatio;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying,
        IDebtToken _debtToken,
        uint256 _collateralizationRatio
    ) ERC20(_name, _symbol) {
        underlying = _underlying;
        debtToken = _debtToken;
        setCollateralizationRatio(_collateralizationRatio);
    }

    /**
     * @notice Mint synthetic asset
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn synthetic asset
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyOwner {
        _burn(_from, _amount);
    }

    /**
     * @notice Set collateralization ratio
     * @param _newCollateralizationRatio The new CR value
     */
    function setCollateralizationRatio(uint256 _newCollateralizationRatio) public override onlyOwner {
        require(_newCollateralizationRatio >= 1e18, "collaterization-ratio-lt-100%");
        collateralizationRatio = _newCollateralizationRatio;
    }
}
