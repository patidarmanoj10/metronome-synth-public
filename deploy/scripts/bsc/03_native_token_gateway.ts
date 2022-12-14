import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../../helpers/address'
import {UpgradableContracts} from '../../helpers'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const {NATIVE_TOKEN_ADDRESS} = Address

const NativeTokenGateway = 'NativeTokenGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, execute, read} = deployments
  const {deployer: from} = await getNamedAccounts()

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: nativeTokenGatewayAddress} = await deploy(NativeTokenGateway, {
    from,
    log: true,
    args: [poolRegistryAddress, NATIVE_TOKEN_ADDRESS],
  })

  const currentGateway = await read(PoolRegistry, 'nativeTokenGateway')

  if (currentGateway !== nativeTokenGatewayAddress) {
    await execute(PoolRegistry, {from, log: true}, 'updateNativeTokenGateway', nativeTokenGatewayAddress)
  }
}

export default func
func.tags = [NativeTokenGateway]
