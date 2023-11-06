import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
import Constants from '../../../helpers/constants'
import {address as mainnetCrossChainDispatcherAddress} from '../../../deployments/mainnet/CrossChainDispatcher.json'

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
    contractAlias: PoolRegistry,
    readMethod: 'crossChainDispatcher',
    writeMethod: 'updateCrossChainDispatcher',
    writeArgs: [crossChainDispatcherAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'stargateComposer',
    writeMethod: 'updateStargateComposer',
    writeArgs: [Address.STARGATE_COMPOSER],
  })

  // Note: Keeps current value because we pause before and unpause after the deployment
  // await updateParamIfNeeded(hre, {
  //   contract: CrossChainDispatcher,
  //   readMethod: 'isBridgingActive',
  //   writeMethod: 'toggleBridgingIsActive',
  //   isCurrentValueUpdated: (isActive: boolean) => isActive,
  // })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'isDestinationChainSupported',
    readArgs: [Constants.LZ_MAINNET_CHAIN_ID],
    writeMethod: 'toggleDestinationChainIsActive',
    writeArgs: [Constants.LZ_MAINNET_CHAIN_ID],
    isCurrentValueUpdated: (isSupported: boolean) => isSupported,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'crossChainDispatcherOf',
    readArgs: [Constants.LZ_MAINNET_CHAIN_ID],
    writeMethod: 'updateCrossChainDispatcherOf',
    writeArgs: [Constants.LZ_MAINNET_CHAIN_ID, mainnetCrossChainDispatcherAddress],
    isCurrentValueUpdated: (currentAddress: boolean, [, newAddress]) => currentAddress == newAddress,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'stargatePoolIdOf',
    readArgs: [Address.WETH_ADDRESS],
    writeMethod: 'updateStargatePoolIdOf',
    writeArgs: [Address.WETH_ADDRESS, Constants.SG_ETH_POOL_ID],
    isCurrentValueUpdated: (currentPoolId: boolean, [, newPoolId]) => currentPoolId == newPoolId,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'stargatePoolIdOf',
    readArgs: [Address.USDC_ADDRESS],
    writeMethod: 'updateStargatePoolIdOf',
    writeArgs: [Address.USDC_ADDRESS, Constants.SG_USDC_POOL_ID],
    isCurrentValueUpdated: (currentPoolId: boolean, [, newPoolId]) => currentPoolId == newPoolId,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'stargatePoolIdOf',
    readArgs: [Address.FRAX_ADDRESS],
    writeMethod: 'updateStargatePoolIdOf',
    writeArgs: [Address.FRAX_ADDRESS, Constants.SG_FRAX_POOL_ID],
    isCurrentValueUpdated: (currentPoolId: boolean, [, newPoolId]) => currentPoolId == newPoolId,
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'flashRepayCallbackTxGasLimit',
    writeMethod: 'updateFlashRepayCallbackTxGasLimit',
    writeArgs: ['1000000'],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'flashRepaySwapTxGasLimit',
    writeMethod: 'updateFlashRepaySwapTxGasLimit',
    writeArgs: ['1250000'],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'leverageCallbackTxGasLimit',
    writeMethod: 'updateLeverageCallbackTxGasLimit',
    writeArgs: ['1750000'],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: CrossChainDispatcher,
    readMethod: 'leverageSwapTxGasLimit',
    writeMethod: 'updateLeverageSwapTxGasLimit',
    writeArgs: ['1750000'],
  })
}

export default func
func.tags = [CrossChainDispatcher]
func.dependencies = [PoolRegistry]
