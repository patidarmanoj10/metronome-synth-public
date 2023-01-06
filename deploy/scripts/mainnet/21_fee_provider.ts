import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'

const {
  Pool: {alias: Pool},
  FeeProvider: {alias: FeeProvider},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, read} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: feeProviderAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.FeeProvider,
    initializeArgs: [],
  })

  const currentFeeProvider = await read(Pool, 'feeProvider')

  if (currentFeeProvider !== feeProviderAddress) {
    await execute(Pool, {from: deployer, log: true}, 'updateFeeProvider', feeProviderAddress)
  }
}

export default func
func.tags = [FeeProvider]
func.dependencies = [Pool]
