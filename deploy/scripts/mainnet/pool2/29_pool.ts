import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'

const {
  Pool2: {alias: Pool2},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const poolRegistry = await get(PoolRegistry)

  const {address: poolAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool2,
    initializeArgs: [poolRegistry.address],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'isPoolRegistered',
    readArgs: [poolAddress],
    writeMethod: 'registerPool',
    writeArgs: [poolAddress],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
    force: true,
  })

  await updateParamIfNeeded(hre, {
    contract: Pool,
    readMethod: 'isBridgingActive',
    writeMethod: 'toggleBridgingIsActive',
    isCurrentValueUpdated: (isActive: boolean) => isActive,
  })
}

export default func
func.tags = [Pool2]
