import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'

const DefaultOracle = 'DefaultOracle'

const Protocol = {
  NONE: 0,
  UNISWAP_V3: 1,
  UNISWAP_V2: 2,
  CHAINLINK: 3,
}

const {CHAINLINK} = Protocol

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy} = deployments
  const {deployer, governor} = await getNamedAccounts()

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
    CHAINLINK,
    chainlinkPriceProvider.address
  )
}

export default func
func.tags = [DefaultOracle]
