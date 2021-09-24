// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @title Contract module which provides a basic governance access control mechanism
 * @dev Based on `@openzeppelin/contracts/access/Ownable.sol` smart contract
 */
abstract contract Governable is Context {
    address private _governor;

    event GovernorshipTransferred(address indexed previousOwner, address indexed newGovernor);

    /**
     * @dev Initializes the contract setting the deployer as the initial governor.
     */
    constructor() {
        _setGovernor(_msgSender());
    }

    /**
     * @dev Returns the address of the current governor.
     */
    function governor() public view virtual returns (address) {
        return _governor;
    }

    /**
     * @dev Throws if called by any account other than the governor.
     */
    modifier onlyGovernor() {
        require(governor() == _msgSender(), "not-governor");
        _;
    }

    /**
     * @dev Leaves the contract without governor. It will not be possible to call
     * `onlyGovernor` functions anymore. Can only be called by the current governor.
     *
     * NOTE: Renouncing governorship will leave the contract without an governor,
     * thereby removing any functionality that is only available to the governor.
     */
    function renounceGovernorship() public virtual onlyGovernor {
        _setGovernor(address(0));
    }

    /**
     * @dev Transfers governorship of the contract to a new account (`newGovernor`).
     * Can only be called by the current governor.
     */
    function transferGovernorship(address newGovernor) public virtual onlyGovernor {
        require(newGovernor != address(0), "new-governor-address-is-zero");
        _setGovernor(newGovernor);
    }

    function _setGovernor(address newGovernor) private {
        address oldGovernor = _governor;
        _governor = newGovernor;
        emit GovernorshipTransferred(oldGovernor, newGovernor);
    }
}
