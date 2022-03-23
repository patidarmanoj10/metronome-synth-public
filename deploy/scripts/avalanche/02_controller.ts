import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'

const MasterOracle = 'MasterOracle'
const {
  Controller: {alias: Controller},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(Controller))

  const masterOracle = await get(MasterOracle)

  await deployUpgradable({hre, contractConfig: UpgradableContracts.Controller, initializeArgs: [masterOracle.address]})

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, Controller)
  }
}

export default func
func.tags = [Controller]
func.dependencies = [MasterOracle]
