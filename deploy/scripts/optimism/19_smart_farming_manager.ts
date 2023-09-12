import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'

const {
  Pool: {alias: Pool},
  SmartFarmingManager: {alias: SmartFarmingManager},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolAddress} = await get(Pool)

  const {address: smartFarmingManagerAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.SmartFarmingManager,
    initializeArgs: [poolAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: Pool,
    readMethod: 'smartFarmingManager',
    writeMethod: 'updateSmartFarmingManager',
    writeArgs: [smartFarmingManagerAddress],
  })
}

export default func
func.tags = [SmartFarmingManager]
func.dependencies = [Pool]
