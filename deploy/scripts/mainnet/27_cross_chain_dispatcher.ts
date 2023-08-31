import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

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
    newValue: crossChainDispatcherAddress,
  })

  await updateParamIfNeeded(hre, {
    contract: CrossChainDispatcher,
    readMethod: 'stargateRouter',
    writeMethod: 'updateStargateRouter',
    newValue: Address.STARGATE_ROUTER,
  })
}

export default func
func.tags = [CrossChainDispatcher]
func.dependencies = [PoolRegistry]
