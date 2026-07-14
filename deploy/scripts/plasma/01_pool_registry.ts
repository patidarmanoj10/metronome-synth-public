import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {setupDestinationChain} from '../../helpers/lz'
import {ethers} from 'hardhat'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.PoolRegistry,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS, Address.FEE_COLLECTOR],
  })

  // Note: There is no swapper on Plasma for now
  // await updateParamIfNeeded(hre, {
  //   contractAlias: PoolRegistry,
  //   readMethod: 'swapper',
  //   writeMethod: 'updateSwapper',
  //   writeArgs: [Address.SWAPPER],
  // })

  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'feeCollector',
    writeMethod: 'updateFeeCollector',
    writeArgs: [Address.FEE_COLLECTOR],
    isCurrentValueUpdated: (current: string) =>
      hre.ethers.utils.getAddress(current) === hre.ethers.utils.getAddress(Address.FEE_COLLECTOR),
  })

  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'isBridgingActive',
    writeMethod: 'toggleBridgingIsActive',
    isCurrentValueUpdated: (isActive: boolean) => isActive == true,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'lzBaseGasLimit',
    writeMethod: 'updateLzBaseGasLimit',
    writeArgs: ['200000'],
  })

  // mainnet <-> plasma
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_MAINNET_CHAIN_ID,
  })

  // base <-> plasma
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_BASE_CHAIN_ID,
  })

  // optimism <-> plasma
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_OP_CHAIN_ID,
  })
}

export default func
func.tags = [PoolRegistry]
