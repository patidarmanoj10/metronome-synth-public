// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import "./dependencies/openzeppelin/utils/math/SafeCast.sol";
import "./access/Manageable.sol";
import "./storage/RewardsDistributorStorage.sol";
import "./lib/WadRayMath.sol";

/**
 * @title RewardsDistributor contract
 */
contract RewardsDistributor is Manageable, RewardsDistributorStorageV1 {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using WadRayMath for uint256;

    /// @notice The initial index
    uint224 public constant INITIAL_INDEX = 1e18;

    /// @notice Emitted when updating token speed
    event TokenSpeedUpdated(IERC20 indexed token, uint256 oldSpeed, uint256 newSpeed);

    /// @notice Emitted when updating accrued token
    event TokensAccruedUpdated(IERC20 indexed token, address indexed account, uint256 tokensDelta, uint256 supplyIndex);

    /// @notice Emitted when reward is claimed
    event RewardClaimed(address account, uint256 amount);

    /**
     * @dev Throws if this contract isn't registred on controller
     */
    modifier onlyIfDistributorExists() {
        bool _distributorAdded = false;
        IRewardsDistributor[] memory _rewardsDistributors = controller.getRewardsDistributors();
        uint256 _length = _rewardsDistributors.length;
        for (uint256 i = 0; i < _length; i++) {
            if (_rewardsDistributors[i] == this) _distributorAdded = true;
        }
        require(_distributorAdded, "distributor-not-added");
        _;
    }

    /**
     * @dev Throws if token doesn't exist
     * @dev Should be a DepositToken (suppliers) or DebtToken (borrowers)
     */
    modifier onlyIfTokenExists(IERC20 _token) {
        if (!controller.isDepositTokenExists(IDepositToken(address(_token)))) {
            ISyntheticToken _syntheticToken = IDebtToken(address(_token)).syntheticToken();
            require(controller.isSyntheticTokenExists(_syntheticToken), "invalid-token");
            require(address(_syntheticToken.debtToken()) == address(_token), "invalid-token");
        }
        _;
    }

    function initialize(IController _controller, IERC20 _rewardToken) external initializer {
        __Manageable_init();

        require(address(_controller) != address(0), "controller-is-null");
        require(address(_rewardToken) != address(0), "reward-token-is-null");

        controller = _controller;
        rewardToken = _rewardToken;
    }

    /**
     * @notice Update speed for token
     */
    function _updateTokenSpeed(IERC20 _token, uint256 _newSpeed)
        private
        onlyIfDistributorExists
        onlyIfTokenExists(_token)
    {
        uint256 _currentSpeed = tokenSpeeds[_token];
        if (_currentSpeed > 0) {
            _updateTokenIndex(_token);
        } else if (_newSpeed > 0) {
            // Add token token to the list
            if (tokenStates[_token].index == 0) {
                tokenStates[_token] = TokenState({index: INITIAL_INDEX, block: getBlockNumber().toUint32()});

                tokens.push(_token);
            } else {
                // Update block number to ensure extra interest is not accrued during the prior period
                tokenStates[_token].block = getBlockNumber().toUint32();
            }
        }

        if (_currentSpeed != _newSpeed) {
            tokenSpeeds[_token] = _newSpeed;
            emit TokenSpeedUpdated(_token, _currentSpeed, _newSpeed);
        }
    }

    /**
     * @notice Accrue reward token by updating the index
     */
    function _updateTokenIndex(IERC20 _token) private {
        TokenState storage _supplyState = tokenStates[_token];
        uint256 _speed = tokenSpeeds[_token];
        uint256 _blockNumber = getBlockNumber();
        uint256 _deltaBlocks = _blockNumber - uint256(_supplyState.block);
        if (_deltaBlocks > 0 && _speed > 0) {
            uint256 _totalSupply = _token.totalSupply();
            uint256 _tokensAccrued = _deltaBlocks * _speed;
            uint256 _ratio = _totalSupply > 0 ? _tokensAccrued.wadDiv(_totalSupply) : 0;
            uint256 _newIndex = _supplyState.index + _ratio;
            tokenStates[_token] = TokenState({index: _newIndex.toUint224(), block: _blockNumber.toUint32()});
        } else if (_deltaBlocks > 0 && _supplyState.index > 0) {
            _supplyState.block = _blockNumber.toUint32();
        }
    }

    /**
     * @notice Calculate tokens accrued by an account
     */
    function _updateTokensAccruedOf(IERC20 _token, address _account) private {
        uint256 _tokenIndex = tokenStates[_token].index;
        uint256 _accountIndex = accountIndexOf[_token][_account];
        accountIndexOf[_token][_account] = _tokenIndex;

        if (_accountIndex == 0 && _tokenIndex > 0) {
            _accountIndex = INITIAL_INDEX;
        }

        uint256 _deltaIndex = _tokenIndex - _accountIndex;
        uint256 _delta = _token.balanceOf(_account).wadMul(_deltaIndex);
        uint256 _tokensAccrued = tokensAccruedOf[_account] + _delta;
        tokensAccruedOf[_account] = _tokensAccrued;
        emit TokensAccruedUpdated(_token, _account, _delta, _tokenIndex);
    }

    /**
     * @notice Update indexes on pre-mint and pre-burn
     * @dev Called by DepositToken and DebtToken contracts
     */
    function updateBeforeMintOrBurn(IERC20 _token, address _account) external {
        if (tokenStates[_token].index > 0) {
            _updateTokenIndex(_token);
            _updateTokensAccruedOf(_token, _account);
        }
    }

    /**
     * @notice Update indexes on pre-transfer
     * @dev Called by DepositToken and DebtToken contracts
     */
    function updateBeforeTransfer(
        IERC20 _token,
        address _from,
        address _to
    ) external {
        if (tokenStates[_token].index > 0) {
            _updateTokenIndex(_token);
            _updateTokensAccruedOf(_token, _from);
            _updateTokensAccruedOf(_token, _to);
        }
    }

    /**
     * @notice Claim tokens accrued by account in all tokens
     */
    function claimRewards(address _account) external {
        claimRewards(_account, tokens);
    }

    /**
     * @notice Claim tokens accrued by account in the specified tokens
     */
    function claimRewards(address _account, IERC20[] memory _tokens) public {
        address[] memory accounts = new address[](1);
        accounts[0] = _account;
        claimRewards(accounts, _tokens);
    }

    /**
     * @notice Claim tokens accrued by the accounts in the specified tokens
     */
    function claimRewards(address[] memory _accounts, IERC20[] memory _tokens) public {
        uint256 _accountsLength = _accounts.length;
        uint256 _tokensLength = _tokens.length;
        for (uint256 i = 0; i < _tokensLength; i++) {
            IERC20 _token = _tokens[i];

            if (tokenStates[_token].index > 0) {
                _updateTokenIndex(_token);
                for (uint256 j = 0; j < _accountsLength; j++) {
                    _updateTokensAccruedOf(_token, _accounts[j]);
                }
            }
        }
        for (uint256 j = 0; j < _accountsLength; j++) {
            tokensAccruedOf[_accounts[j]] = _transferRewardToken(_accounts[j], tokensAccruedOf[_accounts[j]]);
        }
    }

    /**
     * @notice Transfer tokens to the user
     * @dev If there is not enough tokens, we do not perform the transfer
     */
    function _transferRewardToken(address _account, uint256 _amount) private returns (uint256) {
        uint256 _balance = rewardToken.balanceOf(address(this));
        if (_amount > 0 && _amount <= _balance) {
            rewardToken.safeTransfer(_account, _amount);
            emit RewardClaimed(_account, _amount);
            return 0;
        }
        return _amount;
    }

    /**
     * @notice ERC20 recovery in case of stuck tokens due direct transfers to the contract address
     */
    function emergencyTokenTransfer(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external onlyGovernor {
        _token.safeTransfer(_to, _amount);
    }

    /**
     * @notice Update speed for a single deposit token
     */
    function updateTokenSpeed(IERC20 _token, uint256 _newSpeed) external onlyGovernor {
        _updateTokenSpeed(_token, _newSpeed);
    }

    /**
     * @notice Update token speeds
     */
    function updateTokenSpeeds(IERC20[] calldata _tokens, uint256[] calldata _speeds) external onlyGovernor {
        uint256 _tokensLength = _tokens.length;
        require(_tokensLength == _speeds.length, "invalid-input");

        for (uint256 i = 0; i < _tokensLength; ++i) {
            _updateTokenSpeed(_tokens[i], _speeds[i]);
        }
    }

    function getBlockNumber() public view virtual returns (uint256) {
        return block.number;
    }
}
