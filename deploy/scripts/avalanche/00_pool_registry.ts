import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(PoolRegistry))

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.PoolRegistry,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, PoolRegistry)
  }
}

export default func
func.tags = [PoolRegistry]
