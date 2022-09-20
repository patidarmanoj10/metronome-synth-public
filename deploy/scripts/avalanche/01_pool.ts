import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(Pool))

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, Pool)
  }
}

export default func
func.tags = [Pool]
