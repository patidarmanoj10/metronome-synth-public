import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {executeUsingMultiSig} from '../../helpers/multisig-helpers'

const {
  Pool: {alias: Pool},
  Treasury: {alias: Treasury},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {execute, get, read, catchUnknownSigner} = deployments

  const pool = await get(Pool)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury,
    initializeArgs: [pool.address],
  })

  const currentTreasury = await read(Pool, 'treasury')

  if (currentTreasury !== treasuryAddress) {
    const governor = await read(Pool, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(Pool, {from: governor, log: true}, 'updateTreasury', treasuryAddress),
      {
        log: true,
      }
    )

    if (multiSigTx) {
      await executeUsingMultiSig(hre, multiSigTx)
    }
  }
}

export default func
func.tags = [Treasury]
func.dependencies = [Pool]
