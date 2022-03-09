import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../helpers/address'

const {UNISWAP_V2_ROUTER02_ADDRESS, UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS, DAI_ADDRESS} = Address

const TWAP_PERIOD = 60 * 60 * 2 // 2 hours

const DefaultOracle = 'DefaultOracle'

const Protocol = {
  NONE: 0,
  UNISWAP_V3: 1,
  UNISWAP_V2: 2,
  CHAINLINK: 3,
}

const {UNISWAP_V3, UNISWAP_V2, CHAINLINK} = Protocol

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const uniswapV3PriceProvider = await deploy('UniswapV3PriceProvider', {
    from: deployer,
    log: true,
    args: [UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS, DAI_ADDRESS, TWAP_PERIOD],
  })

  const uniswapV2PriceProvider = await deploy('UniswapV2PriceProvider', {
    from: deployer,
    log: true,
    args: [UNISWAP_V2_ROUTER02_ADDRESS, DAI_ADDRESS, TWAP_PERIOD],
  })

  const chainlinkPriceProvider = await deploy('ChainlinkPriceProvider', {
    from: deployer,
    log: true,
  })

  await deploy(DefaultOracle, {
    from: deployer,
    log: true,
    args: [],
  })

  await execute(DefaultOracle, {from: deployer, log: true}, 'transferGovernorship', governor)

  await execute(
    DefaultOracle,
    {from: deployer, log: true},
    'setPriceProvider',
    UNISWAP_V3,
    uniswapV3PriceProvider.address
  )
  await execute(
    DefaultOracle,
    {from: deployer, log: true},
    'setPriceProvider',
    UNISWAP_V2,
    uniswapV2PriceProvider.address
  )
  await execute(
    DefaultOracle,
    {from: deployer, log: true},
    'setPriceProvider',
    CHAINLINK,
    chainlinkPriceProvider.address
  )
}

export default func
func.tags = [DefaultOracle]
