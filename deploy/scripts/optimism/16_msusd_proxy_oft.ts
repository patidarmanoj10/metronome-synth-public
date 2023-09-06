import {ethers, BigNumber} from 'ethers'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'

const {
  Pool: {alias: Pool},
} = UpgradableContracts
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
    contract: MsUSDSynthetic,
    readMethod: 'proxyOFT',
    writeMethod: 'updateProxyOFT',
    writeArgs: [proxyOFTAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: MsUSDSynthetic,
    readMethod: 'maxBridgedInSupply',
    writeMethod: 'updateMaxBridgedInSupply',
    // Note: We won't activate bridge-in by default
    writeArgs: ['0'],
  })

  await updateParamIfNeeded(hre, {
    contract: MsUSDSynthetic,
    readMethod: 'maxBridgedOutSupply',
    writeMethod: 'updateMaxBridgedOutSupply',
    // Note: We won't activate bridge-out by default
    writeArgs: ['0'],
  })

  await updateParamIfNeeded(hre, {
    contract: MsUSDProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    writeArgs: ['true'],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })

  await updateParamIfNeeded(hre, {
    contract: MsUSDProxyOFT,
    readMethod: 'minDstGasLookup',
    readArgs: [Constants.LZ_MAINNET_CHAIN_ID, Constants.LZ_PT_SEND],
    writeMethod: 'setMinDstGas',
    writeArgs: [Constants.LZ_MAINNET_CHAIN_ID, Constants.LZ_PT_SEND, Constants.LZ_MIN_SEND_GAS],
    isCurrentValueUpdated: (currentMinGas: BigNumber, [, , newMinGas]) => currentMinGas.eq(newMinGas),
  })

  // TODO: Uncomment after having mainnet contracts upgraded
  // await updateParamIfNeeded(hre, {
  //   contract: MsUSDProxyOFT,
  //   readMethod: 'trustedRemoteLookup',
  //   readArgs: [Constants.LZ_MAINNET_CHAIN_ID],
  //   writeMethod: 'setTrustedRemote',
  //   writeArgs: [
  //     Constants.LZ_OP_CHAIN_ID,
  //     ethers.utils.solidityPack(['address', 'address'], ['0xMainnetProxyOFT', proxyOFTAddress]),
  //   ],
  //   isCurrentValueUpdated: (currentPath: string, [, newPath]) => currentPath == newPath,
  // })
}

export default func
func.tags = [MsUSDProxyOFT]
func.dependencies = [Pool, MsUSDSynthetic]
