// Notes:
// - Skipping doesn't support globs (Refs: https://github.com/sc-forks/solidity-coverage/issues/291)
// - Run `hardhat clean` whenever updating `skipFiles` (Refs: https://github.com/sc-forks/solidity-coverage/issues/632#issuecomment-978037914)
module.exports = {
  skipFiles: [
    'dependencies/chainlink/interfaces/AggregatorV3Interface.sol',
    'dependencies/openzeppelin/access/Ownable.sol',
    'dependencies/openzeppelin/proxy/beacon/IBeacon.sol',
    'dependencies/openzeppelin/proxy/ERC1967/ERC1967Proxy.sol',
    'dependencies/openzeppelin/proxy/ERC1967/ERC1967Upgrade.sol',
    'dependencies/openzeppelin/proxy/Proxy.sol',
    'dependencies/openzeppelin/proxy/transparent/ProxyAdmin.sol',
    'dependencies/openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol',
    'dependencies/openzeppelin/proxy/utils/Initializable.sol',
    'dependencies/openzeppelin/security/ReentrancyGuard.sol',
    'dependencies/openzeppelin/token/ERC20/ERC20.sol',
    'dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol',
    'dependencies/openzeppelin/token/ERC20/IERC20.sol',
    'dependencies/openzeppelin/token/ERC20/utils/SafeERC20.sol',
    'dependencies/openzeppelin/utils/Address.sol',
    'dependencies/openzeppelin/utils/Context.sol',
    'dependencies/openzeppelin/utils/math/Math.sol',
    'dependencies/openzeppelin/utils/math/SafeCast.sol',
    'dependencies/openzeppelin/utils/StorageSlot.sol',
    'dependencies/openzeppelin/utils/structs/EnumerableSet.sol',
    'dependencies/uniswap/lib/libraries/FixedPoint.sol',
    'dependencies/uniswap/v2-core/interfaces/IUniswapV2Pair.sol',
    'dependencies/uniswap/v2-periphery/interfaces/IUniswapV2Router01.sol',
    'dependencies/uniswap/v2-periphery/interfaces/IUniswapV2Router02.sol',
    'dependencies/uniswap/v2-periphery/libraries/UniswapV2Library.sol',
    'dependencies/uniswap/v2-periphery/libraries/UniswapV2OracleLibrary.sol',
    'mock/ControllerMock.sol',
    'mock/DebtTokenMock.sol',
    'mock/DefaultOracleMock.sol',
    'mock/ERC20Mock.sol',
    'mock/MasterOracleMock.sol',
    'mock/RewardDistributorMock.sol',
  ]
}
