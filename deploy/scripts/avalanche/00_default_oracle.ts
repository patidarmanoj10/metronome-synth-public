import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {transferGovernorshipIfNeeded} from '../../helpers'

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
  const {execute, deploy, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(DefaultOracle))

  const chainlinkPriceProvider = await deploy('ChainlinkPriceProvider', {
    from: deployer,
    log: true,
  })

  await deploy(DefaultOracle, {
    from: deployer,
    log: true,
    args: [],
  })

  if (!wasDeployed) {
    await execute(
      DefaultOracle,
      {from: deployer, log: true},
      'setPriceProvider',
      CHAINLINK,
      chainlinkPriceProvider.address
    )
    await transferGovernorshipIfNeeded(hre, DefaultOracle)
  }
}

export default func
func.tags = [DefaultOracle]
