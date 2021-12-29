// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars
// solhint-disable avoid-low-level-calls
// solhint-disable use-forbidden-name

pragma solidity 0.8.9;

import "../interface/IVSynth.sol";

contract VSynthMock is IVSynth {
    IIssuer public issuer;

    constructor(IIssuer _issuer) {
        issuer = _issuer;
    }

    function deposit(
        IDepositToken _depositToken,
        uint256 _amount,
        address _onBehalfOf
    ) external returns (uint256 _depositedAmount) {
        _depositToken.underlying().transferFrom(msg.sender, address(this), _amount);
        issuer.mintDepositToken(_depositToken, _onBehalfOf, _amount);
        return _amount;
    }

    function mint(ISyntheticAsset, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function withdraw(
        IDepositToken _depositToken,
        uint256 _amount,
        address _to
    ) external returns (uint256 _withdrawnAmount) {
        issuer.burnDepositToken(_depositToken, msg.sender, _amount);
        _depositToken.underlying().transfer(_to, _amount);
        return _amount;
    }

    function repay(
        ISyntheticAsset,
        address,
        uint256
    ) external pure {
        revert("mock-does-not-implement");
    }

    function liquidate(
        ISyntheticAsset,
        address,
        uint256,
        IDepositToken
    ) external pure {
        revert("mock-does-not-implement");
    }

    function swap(
        ISyntheticAsset,
        ISyntheticAsset,
        uint256
    ) external pure returns (uint256) {
        revert("mock-does-not-implement");
    }

    function refinance(ISyntheticAsset, uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateOracle(IOracle) external pure {
        revert("mock-does-not-implement");
    }

    function updateDepositFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateMintFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateWithdrawFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateRepayFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateSwapFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateRefinanceFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateLiquidatorFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateLiquidateFee(uint256) external pure {
        revert("mock-does-not-implement");
    }

    function updateMaxLiquidable(uint256) external pure {
        revert("mock-does-not-implement");
    }
}
