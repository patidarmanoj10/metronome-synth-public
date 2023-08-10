import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
} = UpgradableContracts
const MsETHSynthetic = 'MsETHSynthetic'
const MsETHProxyOFT = 'MsETHProxyOFT'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: msUsdAddress} = await get(MsETHSynthetic)

  const {address: proxyOFTAddress} = await deployUpgradable({
    hre,
    contractConfig: {
      ...UpgradableContracts.ProxyOFT,
      alias: MsETHProxyOFT,
    },
    initializeArgs: [Address.LZ_ENDPOINT, msUsdAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    newValue: proxyOFTAddress,
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    newValue: 'true',
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })
}

export default func
func.tags = [MsETHProxyOFT]
func.dependencies = [Pool, MsETHSynthetic]
