import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../../helpers/address'
import {UpgradableContracts, updateParamIfNeeded} from '../../helpers'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const {NATIVE_TOKEN_ADDRESS} = Address

const NativeTokenGateway = 'NativeTokenGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: nativeTokenGatewayAddress} = await deploy(NativeTokenGateway, {
    from: deployer,
    log: true,
    args: [poolRegistryAddress, NATIVE_TOKEN_ADDRESS],
  })

  await updateParamIfNeeded(hre, {
    contract: PoolRegistry,
    readMethod: 'nativeTokenGateway',
    writeMethod: 'updateNativeTokenGateway',
    writeArgs: [nativeTokenGatewayAddress],
  })
}

export default func
func.tags = [NativeTokenGateway]
