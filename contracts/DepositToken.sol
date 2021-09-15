// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IDepositToken.sol";
import "./interface/IMBox.sol";

/**
 * @title Represents the users' deposits
 * @dev For now, we only support MET as collateral
 */
contract DepositToken is ERC20, Ownable, IDepositToken {
    /**
     * @notice Deposit underlying asset (i.e. MET)
     */
    address public override underlying;

    /**
     * @notice mBox contract
     * @dev Used to check the amount of collateral locked
     */
    IMBox public mBox;

    constructor(address _underlying) ERC20("Tokenized deposit position", "mBOX-MET") {
        underlying = _underlying;
    }

    /**
     * @notice Mint deposit token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) public override onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn deposit token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) public override onlyOwner {
        _burn(_from, _amount);
    }

    /**
     * @notice Use _beforeTokenTransfer hook to lock collateral that's covering debt position
     * @dev Should skip check when minting
     */
    function _beforeTokenTransfer(
        address from,
        address, /*to*/
        uint256 amount
    ) internal view override {
        // allow minting
        if (from == address(0)) {
            return;
        }

        (, , , uint256 _unlockedCollateral, ) = mBox.debtPositionOf(from);
        require(_unlockedCollateral >= amount, "not-enough-free-balance");
    }

    /**
     * @notice Set mBox contract
     * @param _mBox The new mBox contract
     */
    function setMBox(IMBox _mBox) public onlyOwner {
        mBox = _mBox;
    }
}
