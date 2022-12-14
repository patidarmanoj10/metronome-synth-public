import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../../helpers/address'
import {UpgradableContracts, transferGovernorshipIfNeeded} from '../../helpers'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const {NATIVE_TOKEN_ADDRESS} = Address

const NativeTokenGateway = 'NativeTokenGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, execute, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(NativeTokenGateway))

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: nativeTokenGatewayAddress} = await deploy(NativeTokenGateway, {
    from: deployer,
    log: true,
    args: [poolRegistryAddress, NATIVE_TOKEN_ADDRESS],
  })

  if (!wasDeployed) {
    await execute(PoolRegistry, {from: deployer, log: true}, 'updateNativeTokenGateway', nativeTokenGatewayAddress)
    await transferGovernorshipIfNeeded(hre, NativeTokenGateway)
  }
}

export default func
func.tags = [NativeTokenGateway]
