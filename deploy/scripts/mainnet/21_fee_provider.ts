import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
  FeeProvider: {alias: FeeProvider},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: feeProviderAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.FeeProvider,
    initializeArgs: [poolRegistryAddress, Address.ESMET],
  })

  await updateParamIfNeeded(hre, {
    contract: Pool,
    readMethod: 'feeProvider',
    writeMethod: 'updateFeeProvider',
    writeArgs: [feeProviderAddress],
  })
}

export default func
func.tags = [FeeProvider]
func.dependencies = [Pool]
