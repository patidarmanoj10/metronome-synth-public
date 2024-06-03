import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'
import Address from '../../../../helpers/address'

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
    contractAlias: Pool2,
    readMethod: 'isBridgingActive',
    writeMethod: 'toggleBridgingIsActive',
    isCurrentValueUpdated: (isActive: boolean) => !isActive,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: Pool2,
    readMethod: 'governor',
    writeMethod: 'transferGovernorship',
    writeArgs: [Address.GNOSIS_SAFE_ADDRESS],
  })
}

export default func
func.tags = [Pool2]
