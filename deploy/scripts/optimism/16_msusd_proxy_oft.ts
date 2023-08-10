import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
} = UpgradableContracts
const MsUSDSynthetic = 'MsUSDSynthetic'
const MsUSDProxyOFT = 'MsUSDProxyOFT'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get, execute, read, catchUnknownSigner} = deployments

  const {address: msUsdAddress} = await get(MsUSDSynthetic)

  const {address: proxyOFTAddress} = await deployUpgradable({
    hre,
    contractConfig: {
      ...UpgradableContracts.ProxyOFT,
      alias: MsUSDProxyOFT,
    },
    initializeArgs: [Address.LZ_ENDPOINT, msUsdAddress],
  })

  const currentProxyOFT = await read(MsUSDSynthetic, 'proxyOFT')

  if (currentProxyOFT !== proxyOFTAddress) {
    const governor = await read(Pool, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(MsUSDSynthetic, {from: governor, log: true}, 'updateProxyOFT', proxyOFTAddress),
      {log: true}
    )

    if (multiSigTx) {
      await saveForMultiSigBatchExecution(multiSigTx)
    }
  }
}

export default func
func.tags = [MsUSDProxyOFT]
func.dependencies = [Pool, MsUSDSynthetic]
