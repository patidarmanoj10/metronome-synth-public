import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'

const {
  Pool: {alias: Pool},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(Pool))

  const poolRegistry = await get(PoolRegistry)

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool,
    initializeArgs: [poolRegistry.address],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, Pool)
  }
}

export default func
func.tags = [Pool]
