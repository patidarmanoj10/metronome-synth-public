import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  Pool: {alias: Pool},
} = UpgradableContracts
const MsBTCSynthetic = 'MsBTCSynthetic'
const MsBTCProxyOFT = 'MsBTCProxyOFT'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: msBtcAddress} = await get(MsBTCSynthetic)

  const {address: proxyOFTAddress} = await deployUpgradable({
    hre,
    contractConfig: {
      ...UpgradableContracts.ProxyOFT,
      alias: MsBTCProxyOFT,
    },
    initializeArgs: [Address.LZ_ENDPOINT, msBtcAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: MsBTCSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    newValue: proxyOFTAddress,
  })

  await updateParamIfNeeded(hre, {
    contract: MsBTCProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    newValue: 'true',
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })
}

export default func
func.tags = [MsBTCProxyOFT]
func.dependencies = [Pool, MsBTCSynthetic]
