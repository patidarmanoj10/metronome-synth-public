import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'

const {
  Pool: {alias: Pool},
  CrossChainDispatcher: {alias: CrossChainDispatcher},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, execute, read, catchUnknownSigner} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: crossChainDispatcherAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Quoter,
    initializeArgs: [poolRegistryAddress],
  })

  const currentCrossChainDispatcher = await read(PoolRegistry, 'crossChainDispatcher')

  if (currentCrossChainDispatcher !== crossChainDispatcherAddress) {
    const governor = await read(Pool, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(PoolRegistry, {from: governor, log: true}, 'updateCrossChainDispatcher', crossChainDispatcherAddress),
      {log: true}
    )

    if (multiSigTx) {
      await saveForMultiSigBatchExecution(multiSigTx)
    }
  }
}

export default func
func.tags = [CrossChainDispatcher]
func.dependencies = [PoolRegistry]
