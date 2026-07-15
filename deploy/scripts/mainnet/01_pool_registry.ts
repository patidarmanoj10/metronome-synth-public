import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import {setupDestinationChain} from '../../helpers/lz'
import Constants from '../../../helpers/constants'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.PoolRegistry,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS, Address.FEE_COLLECTOR],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'swapper',
    writeMethod: 'updateSwapper',
    writeArgs: [Address.SWAPPER],
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

  // op <-> mainnet
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_OP_CHAIN_ID,
  })

  // base <-> mainnet
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_BASE_CHAIN_ID,
  })

  // plasma <-> mainnet
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_PLASMA_CHAIN_ID,
  })

  // hemi <-> mainnet
  await setupDestinationChain(hre, {
    remoteEid: Constants.LZ_HEMI_CHAIN_ID,
  })
}

export default func
func.tags = [PoolRegistry]
