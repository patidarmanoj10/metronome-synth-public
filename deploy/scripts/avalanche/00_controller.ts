import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Controller: {alias: Controller},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(Controller))

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Controller,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, Controller)
  }
}

export default func
func.tags = [Controller]
