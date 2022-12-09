// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../dependencies/openzeppelin/proxy/transparent/ProxyAdmin.sol";
import "../dependencies/openzeppelin//proxy/transparent/TransparentUpgradeableProxy.sol";
import "../interfaces/external/IMulticall.sol";

error StringFieldIsNotEqual();
error Uint8FieldIsNotEqual();
error Uint256FieldIsNotEqual();
error AddressFieldIsNotEqual();
error BooleanFieldIsNotEqual();

abstract contract UpgraderBase is ProxyAdmin {
    // Note: `Multicall3` contract has same address for all chains
    address public constant multicall = 0xcA11bde05977b3631167028862bE2a173976CA11;

    /// @inheritdoc ProxyAdmin
    function upgrade(TransparentUpgradeableProxy _proxy, address _implementation) public override onlyOwner {
        bytes[] memory calls = _calls();
        bytes[] memory beforeResults = _aggregate(_proxy, calls);

        _proxy.upgradeTo(_implementation);

        bytes[] memory afterResults = _aggregate(_proxy, calls);
        _checkResults(beforeResults, afterResults);
    }

    /// @inheritdoc ProxyAdmin
    function upgradeAndCall(
        TransparentUpgradeableProxy _proxy,
        address _implementation,
        bytes calldata _data
    ) public payable override onlyOwner {
        bytes[] memory calls = _calls();
        bytes[] memory beforeResults = _aggregate(_proxy, calls);

        TransparentUpgradeableProxy(payable(_proxy)).upgradeToAndCall{value: msg.value}(_implementation, _data);

        bytes[] memory afterResults = _aggregate(_proxy, calls);
        _checkResults(beforeResults, afterResults);
    }

    /**
     * @notice Execute storage check calls using `Multicall3` contract
     * @param _proxy The proxy being upgraded is the target contract
     * @param _callDatas The array of storage calls to check
     * @return results The storage values
     */
    function _aggregate(TransparentUpgradeableProxy _proxy, bytes[] memory _callDatas)
        internal
        returns (bytes[] memory results)
    {
        uint256 _length = _callDatas.length;
        IMulticall.Call[] memory calls = new IMulticall.Call[](_length);
        for (uint256 i; i < _length; ++i) {
            calls[i].target = address(_proxy);
            calls[i].callData = _callDatas[i];
        }
        (, results) = IMulticall(multicall).aggregate(calls);
    }

    /**
     * @notice Return list of storage calls
     * @dev The values of those calls will be compared before and after upgrade to check storage integrity
     */
    function _calls() internal virtual returns (bytes[] memory calls);

    /**
     * @notice Compare values
     * @dev Throws if values are inconsistent
     */
    function _checkResults(bytes[] memory _beforeResults, bytes[] memory _afterResults) internal virtual;

    /**
     * @notice Compare `string` values
     */
    function _checkStringResults(
        bytes[] memory _beforeResults,
        bytes[] memory _afterResults,
        uint256 _from,
        uint256 _to
    ) internal pure {
        for (uint256 i = _from; i <= _to; ++i) {
            string memory _before = abi.decode(_beforeResults[i], (string));
            string memory _after = abi.decode(_afterResults[i], (string));
            if (keccak256(bytes(_before)) != keccak256(bytes(_after))) revert StringFieldIsNotEqual();
        }
    }

    /**
     * @notice Compare `uint8` values
     */
    function _checkUint8Results(
        bytes[] memory _beforeResults,
        bytes[] memory _afterResults,
        uint8 _from,
        uint8 _to
    ) internal pure {
        for (uint256 i = _from; i <= _to; ++i) {
            uint256 _before = abi.decode(_beforeResults[i], (uint8));
            uint256 _after = abi.decode(_afterResults[i], (uint8));
            if (_before != _after) revert Uint8FieldIsNotEqual();
        }
    }

    /**
     * @notice Compare `uint256` values
     */
    function _checkUint256Results(
        bytes[] memory _beforeResults,
        bytes[] memory _afterResults,
        uint256 _from,
        uint256 _to
    ) internal pure {
        for (uint256 i = _from; i <= _to; ++i) {
            uint256 _before = abi.decode(_beforeResults[i], (uint256));
            uint256 _after = abi.decode(_afterResults[i], (uint256));
            if (_before != _after) revert Uint256FieldIsNotEqual();
        }
    }

    /**
     * @notice Compare `address` values
     */
    function _checkAddressResults(
        bytes[] memory _beforeResults,
        bytes[] memory _afterResults,
        uint256 _from,
        uint256 _to
    ) internal pure {
        for (uint256 i = _from; i <= _to; ++i) {
            address _before = abi.decode(_beforeResults[i], (address));
            address _after = abi.decode(_afterResults[i], (address));
            if (_before != _after) revert AddressFieldIsNotEqual();
        }
    }

    /**
     * @notice Compare `address` values
     */
    function _checkBooleanResults(
        bytes[] memory _beforeResults,
        bytes[] memory _afterResults,
        uint256 _from,
        uint256 _to
    ) internal pure {
        for (uint256 i = _from; i <= _to; ++i) {
            bool _before = abi.decode(_beforeResults[i], (bool));
            bool _after = abi.decode(_afterResults[i], (bool));
            if (_before != _after) revert BooleanFieldIsNotEqual();
        }
    }
}
