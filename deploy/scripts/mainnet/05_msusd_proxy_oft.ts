import {ethers, BigNumber} from 'ethers'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {address as opMsUSDProxyOFTAddress} from '../../../deployments/optimism/MsUSDProxyOFT.json'
import {parseEther} from '../../../helpers'

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
    writeArgs: [parseEther('200000').toString()],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'maxBridgedOutSupply',
    writeMethod: 'updateMaxBridgedOutSupply',
    writeArgs: [parseEther('200000').toString()],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDProxyOFT,
    readMethod: 'useCustomAdapterParams',
    writeMethod: 'setUseCustomAdapterParams',
    writeArgs: ['true'],
    isCurrentValueUpdated: (currentValue: boolean) => currentValue,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDProxyOFT,
    readMethod: 'minDstGasLookup',
    readArgs: [Constants.LZ_OP_CHAIN_ID, Constants.LZ_PT_SEND],
    writeMethod: 'setMinDstGas',
    writeArgs: [Constants.LZ_OP_CHAIN_ID, Constants.LZ_PT_SEND, Constants.LZ_MIN_SEND_GAS],
    isCurrentValueUpdated: (currentMinGas: BigNumber, [, , newMinGas]) => currentMinGas.eq(newMinGas),
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDProxyOFT,
    readMethod: 'trustedRemoteLookup',
    readArgs: [Constants.LZ_OP_CHAIN_ID],
    writeMethod: 'setTrustedRemote',
    writeArgs: [
      Constants.LZ_OP_CHAIN_ID,
      ethers.utils.solidityPack(['address', 'address'], [opMsUSDProxyOFTAddress, proxyOFTAddress]),
    ],
    isCurrentValueUpdated: (currentPath: string, [, newPath]) => currentPath == newPath,
  })
}

export default func
func.tags = [MsUSDProxyOFT]
func.dependencies = [MsUSDSynthetic]
