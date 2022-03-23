import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'

const DefaultOracle = 'DefaultOracle'
const {alias: MasterOracle} = UpgradableContracts.MasterOracle

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(MasterOracle))

  const defaultOracle = await get(DefaultOracle)

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.MasterOracle,
    initializeArgs: [[], [], defaultOracle.address],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, MasterOracle)
  }
}

export default func
func.tags = [MasterOracle]
func.dependencies = [DefaultOracle]
