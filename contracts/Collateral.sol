// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/ICollateral.sol";
import "./interface/IMBox.sol";

/// @title Represents the users' deposits for a given collateral
/// @dev For now, we support only MET as collateral
contract Collateral is ERC20, Ownable, ICollateral {
    /// @notice Synthetic underlying asset
    address public override underlyingAsset;

    /// @notice MBox contract
    IMBox public mBox;

    constructor(address _underlyingAsset) ERC20("Tokenized deposit position", "mBOX-MET") {
        underlyingAsset = _underlyingAsset;
    }

    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) public override onlyOwner {
        _burn(_from, _amount);
    }

    function setMBox(IMBox _mBox) public onlyOwner {
        mBox = _mBox;
    }

    function _beforeTokenTransfer(
        address from,
        address, /*to*/
        uint256 amount
    ) internal view override {
        // allow minting
        if (from == address(0)) {
            return;
        }

        (, , , uint256 _freeCollateral, ) = mBox.debtPositionOf(from);
        require(_freeCollateral >= amount, "not-enough-free-balance");
    }
}
