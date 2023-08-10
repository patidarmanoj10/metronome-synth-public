import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'

const {
  Pool: {alias: Pool},
  Quoter: {alias: Quoter},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, execute, read, catchUnknownSigner} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: quoterAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Quoter,
    initializeArgs: [poolRegistryAddress],
  })

  const currentQuoter = await read(PoolRegistry, 'quoter')

  if (currentQuoter !== quoterAddress) {
    const governor = await read(Pool, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(PoolRegistry, {from: governor, log: true}, 'updateQuoter', quoterAddress),
      {log: true}
    )

    if (multiSigTx) {
      await saveForMultiSigBatchExecution(multiSigTx)
    }
  }
}

export default func
func.tags = [Quoter]
func.dependencies = [PoolRegistry]
