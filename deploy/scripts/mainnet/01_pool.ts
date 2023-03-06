import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {executeUsingMultiSig} from '../../helpers/multisig-helpers'

const {
  Pool: {alias: Pool},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, read, execute, catchUnknownSigner} = deployments

  const poolRegistry = await get(PoolRegistry)

  const {address: poolAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool,
    initializeArgs: [poolRegistry.address],
    forceUpgrade: true,
  })

  const isRegistered = await read(PoolRegistry, 'isPoolRegistered', poolAddress)

  if (!isRegistered) {
    const governor = await read(PoolRegistry, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(PoolRegistry, {from: governor, log: true}, 'registerPool', poolAddress),
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
func.tags = [Pool]
