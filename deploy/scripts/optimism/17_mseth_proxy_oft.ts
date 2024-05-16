import {ethers, BigNumber} from 'ethers'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {address as mainnetMsETHProxyOFTAddress} from '../../../deployments/mainnet/MsETHProxyOFT.json'
import {address as baseMsETHProxyOFTAddress} from '../../../deployments/base/MsETHProxyOFT.json'
import {parseEther} from '../../../helpers'

const {
  Pool: {alias: Pool},
} = UpgradableContracts
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
    contract: MsETHSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    writeArgs: [proxyOFTAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHSynthetic,
    readMethod: 'maxBridgedInSupply',
    writeMethod: 'updateMaxBridgedInSupply',
    writeArgs: [parseEther('4500').toString()],
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHSynthetic,
    readMethod: 'maxBridgedOutSupply',
    writeMethod: 'updateMaxBridgedOutSupply',
    writeArgs: [parseEther('4500').toString()],
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    writeArgs: ['true'],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })

  //
  // paths
  //

  // mainnet -> op
  await updateParamIfNeeded(hre, {
    contract: MsETHProxyOFT,
    readMethod: 'minDstGasLookup',
    readArgs: [Constants.LZ_MAINNET_CHAIN_ID, Constants.LZ_PT_SEND],
    writeMethod: 'setMinDstGas',
    writeArgs: [Constants.LZ_MAINNET_CHAIN_ID, Constants.LZ_PT_SEND, Constants.LZ_MIN_SEND_GAS],
    isCurrentValueUpdated: (currentMinGas: BigNumber, [, , newMinGas]) => currentMinGas.eq(newMinGas),
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHProxyOFT,
    readMethod: 'trustedRemoteLookup',
    readArgs: [Constants.LZ_MAINNET_CHAIN_ID],
    writeMethod: 'setTrustedRemote',
    writeArgs: [
      Constants.LZ_MAINNET_CHAIN_ID,
      ethers.utils.solidityPack(['address', 'address'], [mainnetMsETHProxyOFTAddress, proxyOFTAddress]),
    ],
    isCurrentValueUpdated: (currentPath: string, [, newPath]) => currentPath == newPath,
  })

  // base -> op
  await updateParamIfNeeded(hre, {
    contract: MsETHProxyOFT,
    readMethod: 'minDstGasLookup',
    readArgs: [Constants.LZ_BASE_CHAIN_ID, Constants.LZ_PT_SEND],
    writeMethod: 'setMinDstGas',
    writeArgs: [Constants.LZ_BASE_CHAIN_ID, Constants.LZ_PT_SEND, Constants.LZ_MIN_SEND_GAS],
    isCurrentValueUpdated: (currentMinGas: BigNumber, [, , newMinGas]) => currentMinGas.eq(newMinGas),
  })

  await updateParamIfNeeded(hre, {
    contract: MsETHProxyOFT,
    readMethod: 'trustedRemoteLookup',
    readArgs: [Constants.LZ_BASE_CHAIN_ID],
    writeMethod: 'setTrustedRemote',
    writeArgs: [
      Constants.LZ_BASE_CHAIN_ID,
      ethers.utils.solidityPack(['address', 'address'], [baseMsETHProxyOFTAddress, proxyOFTAddress]),
    ],
    isCurrentValueUpdated: (currentPath: string, [, newPath]) => currentPath == newPath,
  })
}

export default func
func.tags = [MsETHProxyOFT]
func.dependencies = [Pool, MsETHSynthetic]
