import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
  FeeProvider: {alias: FeeProvider},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, execute, read, catchUnknownSigner} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: feeProviderAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.FeeProvider,
    initializeArgs: [poolRegistryAddress, Address.ESMET],
  })

  const currentFeeProvider = await read(Pool, 'feeProvider')

  if (currentFeeProvider !== feeProviderAddress) {
    const governor = await read(Pool, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(Pool, {from: governor, log: true}, 'updateFeeProvider', feeProviderAddress),
      {log: true}
    )

    if (multiSigTx) {
      await saveForMultiSigBatchExecution(multiSigTx)
    }
  }
}

export default func
func.tags = [FeeProvider]
func.dependencies = [Pool]
