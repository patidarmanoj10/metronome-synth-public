import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {address as mainnetMsETHProxyOFTAddress} from '../../../deployments/mainnet/MsETHProxyOFT.json'
import {address as baseMsETHProxyOFTAddress} from '../../../deployments/base/MsETHProxyOFT.json'
import {address as hemiMsETHProxyOFTAddress} from '../../../deployments/hemi/MsETHProxyOFT.json'
import {address as plasmaMsETHProxyOFTAddress} from '../../../deployments/plasma/MsETHProxyOFT.json'
import {parseEther} from '../../../helpers'
import {setupOftPath} from '../../helpers/lz'

const MsETHSynthetic = 'MsETHSynthetic'
const MsETHProxyOFT = 'MsETHProxyOFT'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: msEthAddress} = await get(MsETHSynthetic)

  const {address: proxyOFTAddress} = await deployUpgradable({
    hre,
    contractConfig: {
      ...UpgradableContracts.ProxyOFT,
      alias: MsETHProxyOFT,
    },
    initializeArgs: [Address.LZ_ENDPOINT, msEthAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    writeArgs: [proxyOFTAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'maxBridgedInSupply',
    writeMethod: 'updateMaxBridgedInSupply',
    writeArgs: [parseEther('4500').toString()],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'maxBridgedOutSupply',
    writeMethod: 'updateMaxBridgedOutSupply',
    writeArgs: [parseEther('4500').toString()],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsETHProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    writeArgs: ['true'],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })

  //
  // paths
  //

  // mainnet <-> op
  await setupOftPath(hre, {
    contractAlias: MsETHProxyOFT,
    remoteEid: Constants.LZ_MAINNET_CHAIN_ID,
    remoteOftAddress: mainnetMsETHProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })

  // base <-> op
  await setupOftPath(hre, {
    contractAlias: MsETHProxyOFT,
    remoteEid: Constants.LZ_BASE_CHAIN_ID,
    remoteOftAddress: baseMsETHProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })

  // hemi <-> op
  await setupOftPath(hre, {
    contractAlias: MsETHProxyOFT,
    remoteEid: Constants.LZ_HEMI_CHAIN_ID,
    remoteOftAddress: hemiMsETHProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })

  // plasma <-> op
  await setupOftPath(hre, {
    contractAlias: MsETHProxyOFT,
    remoteEid: Constants.LZ_PLASMA_CHAIN_ID,
    remoteOftAddress: plasmaMsETHProxyOFTAddress,
    localOftAddress: proxyOFTAddress,
  })
}

export default func
func.tags = [MsETHProxyOFT]
func.dependencies = [MsETHSynthetic]
