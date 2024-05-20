/* eslint-disable camelcase */
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'

const {
  Pool2: {alias: Pool2},
  SmartFarmingManager_Pool2: {alias: SmartFarmingManager_Pool2},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolAddress} = await get(Pool2)

  const {address: smartFarmingManagerAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.SmartFarmingManager_Pool2,
    initializeArgs: [poolAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: Pool2,
    readMethod: 'smartFarmingManager',
    writeMethod: 'updateSmartFarmingManager',
    writeArgs: [smartFarmingManagerAddress],
  })
}

export default func
func.tags = [SmartFarmingManager_Pool2]
func.dependencies = [Pool2]
