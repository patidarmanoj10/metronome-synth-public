import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'

const {
  Pool: {alias: Pool},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre
  const {get, getOrNull, execute} = deployments
  const {deployer: from} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(Pool))

  const poolRegistry = await get(PoolRegistry)

  const {address} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool,
    initializeArgs: [poolRegistry.address],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, Pool)
    await execute(PoolRegistry, {from, log: true}, 'registerPool', address)
  }
}

export default func
func.tags = [Pool]
