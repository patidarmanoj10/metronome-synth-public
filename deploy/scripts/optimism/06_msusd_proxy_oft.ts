import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {address as mainnetMsUSDProxyOFTAddress} from '../../../deployments/mainnet/MsUSDProxyOFT.json'
import {address as baseMsUSDProxyOFTAddress} from '../../../deployments/base/MsUSDProxyOFT.json'
import {address as plasmaMsUSDProxyOFTAddress} from '../../../deployments/plasma/MsUSDProxyOFT.json'
import {address as hemiMsUSDProxyOFTAddress} from '../../../deployments/hemi/MsUSDProxyOFT.json'
import {parseEther} from '../../../helpers'
import {setupOftPath} from '../../helpers/lz'

const MsUSDSynthetic = 'MsUSDSynthetic'
const MsUSDProxyOFT = 'MsUSDProxyOFT'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: msUsdAddress} = await get(MsUSDSynthetic)

  const {address: proxyOFTAddress} = await deployUpgradable({
    hre,
    contractConfig: {
      ...UpgradableContracts.ProxyOFT,
      alias: MsUSDProxyOFT,
    },
    initializeArgs: [Address.LZ_ENDPOINT, msUsdAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    writeArgs: [proxyOFTAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'maxBridgedInSupply',
    writeMethod: 'updateMaxBridgedInSupply',
    writeArgs: [parseEther('10000000').toString()],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'maxBridgedOutSupply',
    writeMethod: 'updateMaxBridgedOutSupply',
    writeArgs: [parseEther('10000000').toString()],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    writeArgs: ['true'],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })

  //
  // paths
  //

  // mainnet -> op
  await setupOftPath(hre, {
    contractAlias: MsUSDProxyOFT,
    remoteEid: Constants.LZ_MAINNET_CHAIN_ID,
    remoteOftAddress: mainnetMsUSDProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })

  // base -> op
  await setupOftPath(hre, {
    contractAlias: MsUSDProxyOFT,
    remoteEid: Constants.LZ_BASE_CHAIN_ID,
    remoteOftAddress: baseMsUSDProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })

  // plasma <-> op
  await setupOftPath(hre, {
    contractAlias: MsUSDProxyOFT,
    remoteEid: Constants.LZ_PLASMA_CHAIN_ID,
    remoteOftAddress: plasmaMsUSDProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })

  // hemi -> op
  await setupOftPath(hre, {
    contractAlias: MsUSDProxyOFT,
    remoteEid: Constants.LZ_HEMI_CHAIN_ID,
    remoteOftAddress: hemiMsUSDProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })
}

export default func
func.tags = [MsUSDProxyOFT]
func.dependencies = [MsUSDSynthetic]
