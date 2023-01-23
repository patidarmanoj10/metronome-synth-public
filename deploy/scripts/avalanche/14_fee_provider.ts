import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
  FeeProvider: {alias: FeeProvider},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {get, execute, read} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: feeProviderAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.FeeProvider,
    initializeArgs: [poolRegistryAddress, Address.ESMET],
  })

  const currentFeeProvider = await read(Pool, 'feeProvider')

  if (currentFeeProvider !== feeProviderAddress) {
    await execute(Pool, {from: deployer, log: true}, 'updateFeeProvider', feeProviderAddress)
  }
}

export default func
func.tags = [FeeProvider]
func.dependencies = [Pool]
