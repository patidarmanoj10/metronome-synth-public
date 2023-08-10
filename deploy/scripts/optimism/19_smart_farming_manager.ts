import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'

const {
  Pool: {alias: Pool},
  SmartFarmingManager: {alias: SmartFarmingManager},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, execute, read, catchUnknownSigner} = deployments

  const {address: poolAddress} = await get(Pool)

  const {address: smartFarmingManagerAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Quoter,
    initializeArgs: [poolAddress],
  })

  const currentSmartFarmingManager = await read(Pool, 'smartFarmingManager')

  if (currentSmartFarmingManager !== smartFarmingManagerAddress) {
    const governor = await read(Pool, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(Pool, {from: governor, log: true}, 'updateSmartFarmingManager', smartFarmingManagerAddress),
      {log: true}
    )

    if (multiSigTx) {
      await saveForMultiSigBatchExecution(multiSigTx)
    }
  }
}

export default func
func.tags = [SmartFarmingManager]
func.dependencies = [Pool]
