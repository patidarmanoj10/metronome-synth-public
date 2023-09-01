import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
} = UpgradableContracts
const MsOPSynthetic = 'MsOPSynthetic'
const MsOPProxyOFT = 'MsOPProxyOFT'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: msOpAddress} = await get(MsOPSynthetic)

  const {address: proxyOFTAddress} = await deployUpgradable({
    hre,
    contractConfig: {
      ...UpgradableContracts.ProxyOFT,
      alias: MsOPProxyOFT,
    },
    initializeArgs: [Address.LZ_ENDPOINT, msOpAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: MsOPSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    newValue: proxyOFTAddress,
  })

  await updateParamIfNeeded(hre, {
    contract: MsOPProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    newValue: 'true',
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })
}

export default func
func.tags = [MsOPProxyOFT]
func.dependencies = [Pool, MsOPSynthetic]
