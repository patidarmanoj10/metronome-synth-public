import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {address as opCrossChainDispatcherAddress} from '../../../deployments/optimism/CrossChainDispatcher.json'

const {
  CrossChainDispatcher: {alias: CrossChainDispatcher},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: crossChainDispatcherAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.CrossChainDispatcher,
    initializeArgs: [poolRegistryAddress, Address.WETH_ADDRESS, Address.SGETH_ADDRESS],
  })

  await updateParamIfNeeded(hre, {
    contract: PoolRegistry,
    readMethod: 'crossChainDispatcher',
    writeMethod: 'updateCrossChainDispatcher',
    writeArgs: [crossChainDispatcherAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'stargateComposer',
    writeMethod: 'updateStargateComposer',
    writeArgs: [Address.STARGATE_COMPOSER],
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'isBridgingActive',
    writeMethod: 'toggleBridgingIsActive',
    isCurrentValueUpdated: (isActive: boolean) => isActive,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'isDestinationChainSupported',
    readArgs: [Constants.LZ_OP_CHAIN_ID],
    writeMethod: 'toggleDestinationChainIsActive',
    writeArgs: [Constants.LZ_OP_CHAIN_ID],
    isCurrentValueUpdated: (isSupported: boolean) => isSupported,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'crossChainDispatcherOf',
    readArgs: [Constants.LZ_OP_CHAIN_ID],
    writeMethod: 'updateCrossChainDispatcherOf',
    writeArgs: [Constants.LZ_OP_CHAIN_ID, opCrossChainDispatcherAddress],
    isCurrentValueUpdated: (currentAddress: boolean, [, newAddress]) => currentAddress == newAddress,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'stargatePoolIdOf',
    readArgs: [Address.WETH_ADDRESS],
    writeMethod: 'updateStargatePoolIdOf',
    writeArgs: [Address.WETH_ADDRESS, Constants.SG_ETH_POOL_ID],
    isCurrentValueUpdated: (currentPoolId: boolean, [, newPoolId]) => currentPoolId == newPoolId,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'stargatePoolIdOf',
    readArgs: [Address.USDC_ADDRESS],
    writeMethod: 'updateStargatePoolIdOf',
    writeArgs: [Address.USDC_ADDRESS, Constants.SG_USDC_POOL_ID],
    isCurrentValueUpdated: (currentPoolId: boolean, [, newPoolId]) => currentPoolId == newPoolId,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'stargatePoolIdOf',
    readArgs: [Address.FRAX_ADDRESS],
    writeMethod: 'updateStargatePoolIdOf',
    writeArgs: [Address.FRAX_ADDRESS, Constants.SG_FRAX_POOL_ID],
    isCurrentValueUpdated: (currentPoolId: boolean, [, newPoolId]) => currentPoolId == newPoolId,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'flashRepayCallbackTxGasLimit',
    writeMethod: 'updateFlashRepayCallbackTxGasLimit',
    writeArgs: ['1500000'],
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'flashRepaySwapTxGasLimit',
    writeMethod: 'updateFlashRepaySwapTxGasLimit',
    writeArgs: ['1500000'],
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'leverageCallbackTxGasLimit',
    writeMethod: 'updateLeverageCallbackTxGasLimit',
    writeArgs: ['1750000'],
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'leverageSwapTxGasLimit',
    writeMethod: 'updateLeverageSwapTxGasLimit',
    writeArgs: ['1750000'],
  })
}

export default func
func.tags = [CrossChainDispatcher]
func.dependencies = [PoolRegistry]
