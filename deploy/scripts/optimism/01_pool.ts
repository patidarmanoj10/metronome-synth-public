import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'

const {
  Pool: {alias: Pool},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const poolRegistry = await get(PoolRegistry)

  const {address: poolAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool,
    initializeArgs: [poolRegistry.address],
  })

  await updateParamIfNeeded(hre, {
    contract: PoolRegistry,
    readMethod: 'isPoolRegistered',
    readArgs: [poolAddress],
    writeMethod: 'registerPool',
    writeArgs: [poolAddress],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })

  await updateParamIfNeeded(hre, {
    contract: Pool,
    readMethod: 'isBridgingActive',
    writeMethod: 'toggleBridgingIsActive',
    isCurrentValueUpdated: (isActive: boolean) => isActive,
  })
}

export default func
func.tags = [Pool]
