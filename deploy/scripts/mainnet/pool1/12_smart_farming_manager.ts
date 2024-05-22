/* eslint-disable camelcase */
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'

const {
  Pool1: {alias: Pool},
  SmartFarmingManager_Pool1: {alias: SmartFarmingManager_Pool1},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolAddress} = await get(Pool)

  const {address: smartFarmingManagerAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.SmartFarmingManager_Pool1,
    initializeArgs: [poolAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: Pool,
    readMethod: 'smartFarmingManager',
    writeMethod: 'updateSmartFarmingManager',
    writeArgs: [smartFarmingManagerAddress],
  })
}

export default func
func.tags = [SmartFarmingManager_Pool1]
func.dependencies = [Pool]
