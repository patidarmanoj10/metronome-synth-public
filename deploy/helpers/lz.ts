import {ethers, BigNumber} from 'ethers'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {UpgradableContracts, updateParamIfNeeded} from '.'
import Constants from '../../helpers/constants'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

export const setupOftPath = async (
  hre: HardhatRuntimeEnvironment,
  {
    contractAlias,
    remoteEid,
    remoteOftAddress,
    localOftAddress,
  }: {contractAlias: string; remoteEid: string; remoteOftAddress: string; localOftAddress: string}
) => {
  await updateParamIfNeeded(hre, {
    contractAlias,
    readMethod: 'minDstGasLookup',
    readArgs: [remoteEid, Constants.LZ_PT_SEND],
    writeMethod: 'setMinDstGas',
    writeArgs: [remoteEid, Constants.LZ_PT_SEND, Constants.LZ_MIN_SEND_GAS],
    isCurrentValueUpdated: (currentMinGas: BigNumber, [, , newMinGas]) => currentMinGas.eq(newMinGas),
  })

  await updateParamIfNeeded(hre, {
    contractAlias,
    readMethod: 'trustedRemoteLookup',
    readArgs: [remoteEid],
    writeMethod: 'setTrustedRemote',
    writeArgs: [remoteEid, ethers.utils.solidityPack(['address', 'address'], [remoteOftAddress, localOftAddress])],
    isCurrentValueUpdated: (currentPath: string, [, newPath]) => currentPath == newPath,
  })
}

export const setupDestinationChain = async (hre: HardhatRuntimeEnvironment, {remoteEid}: {remoteEid: string}) => {
  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'isDestinationChainSupported',
    readArgs: [remoteEid],
    writeMethod: 'toggleDestinationChainIsActive',
    writeArgs: [remoteEid],
    isCurrentValueUpdated: (isSupported: boolean) => isSupported,
  })
}
