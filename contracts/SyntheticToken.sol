// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/utils/Context.sol";
import "./dependencies/openzeppelin/security/ReentrancyGuard.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IManageable.sol";
import "./lib/WadRayMath.sol";
import "./storage/SyntheticTokenStorage.sol";

/**
 * @title Synthetic Token contract
 */
contract SyntheticToken is Context, ReentrancyGuard, SyntheticTokenStorageV1 {
    using WadRayMath for uint256;

    string public constant VERSION = "1.0.0";

    /// @notice Emitted when active flag is updated
    event SyntheticTokenActiveUpdated(bool oldActive, bool newActive);

    /**
     * @dev Throws if synthetic token isn't enabled
     */
    modifier onlyIfSyntheticTokenIsActive() {
        require(isActive, "synthetic-inactive");
        _;
    }

    /**
     * @notice Check if caller is authorized to mint/burn (i.e. if is a valid Pool or a valid DebtToken)
     * @dev It's a short-term solution that will probably be redesigned (See more: https://github.com/bloqpriv/metronome-synth/issues/480)
     */
    modifier onlyIfAuthorized() {
        bool isPool = poolRegistry.poolExists(_msgSender());
        if (isPool) {
            require(IPool(_msgSender()).isSyntheticTokenExists(this), "invalid-pool");
        } else {
            IPool _pool = IManageable(_msgSender()).pool();
            require(poolRegistry.poolExists(address(_pool)), "invalid-pool");
            require(_pool.isDebtTokenExists(IDebtToken(_msgSender())), "invalid-debt-token");
            require(IDebtToken(_msgSender()).syntheticToken() == this, "invalid-debt-token");
        }
        _;
    }

    /**
     * @notice Throws if caller isn't the governor
     */
    modifier onlyGovernor() {
        require(_msgSender() == poolRegistry.governor(), "not-governor");
        _;
    }

    function initialize(
        string calldata _name,
        string calldata _symbol,
        uint8 _decimals,
        IPoolRegistry _poolRegistry
    ) public initializer {
        require(address(_poolRegistry) != address(0), "pool-registry-is-null");

        poolRegistry = _poolRegistry;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        isActive = true;
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = allowance[sender][_msgSender()];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "amount-exceeds-allowance");
            unchecked {
                _approve(sender, _msgSender(), currentAllowance - amount);
            }
        }

        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        _approve(_msgSender(), spender, allowance[_msgSender()][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 currentAllowance = allowance[_msgSender()][spender];
        require(currentAllowance >= subtractedValue, "decreased-allowance-below-zero");
        unchecked {
            _approve(_msgSender(), spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) private {
        require(sender != address(0), "transfer-from-the-zero-address");
        require(recipient != address(0), "transfer-to-the-zero-address");

        uint256 senderBalance = balanceOf[sender];
        require(senderBalance >= amount, "transfer-amount-exceeds-balance");
        unchecked {
            balanceOf[sender] = senderBalance - amount;
        }
        balanceOf[recipient] += amount;

        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) private onlyIfSyntheticTokenIsActive {
        require(account != address(0), "mint-to-the-zero-address");

        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) private {
        require(account != address(0), "burn-from-the-zero-address");

        uint256 accountBalance = balanceOf[account];
        require(accountBalance >= amount, "burn-amount-exceeds-balance");
        unchecked {
            balanceOf[account] = accountBalance - amount;
        }
        totalSupply -= amount;

        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) private {
        require(owner != address(0), "approve-from-the-zero-address");
        require(spender != address(0), "approve-to-the-zero-address");

        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @notice Mint synthetic token
     * @param _to The account to mint to
     * @param _amount The amount to mint
     */
    function mint(address _to, uint256 _amount) external override onlyIfAuthorized {
        _mint(_to, _amount);
    }

    /**
     * @notice Burn synthetic token
     * @param _from The account to burn from
     * @param _amount The amount to burn
     */
    function burn(address _from, uint256 _amount) external override onlyIfAuthorized {
        _burn(_from, _amount);
    }

    /**
     * @notice Seize synthetic tokens
     * @dev Same as _transfer
     * @param _from The account to seize from
     * @param _to The beneficiary account
     * @param _amount The amount to seize
     */
    function seize(
        address _from,
        address _to,
        uint256 _amount
    ) external override onlyIfAuthorized {
        _transfer(_from, _to, _amount);
    }

    /**
     * @notice Enable/Disable the Synthetic Token
     */
    function toggleIsActive() external override onlyGovernor {
        bool _isActive = isActive;
        emit SyntheticTokenActiveUpdated(_isActive, !_isActive);
        isActive = !_isActive;
    }
}
