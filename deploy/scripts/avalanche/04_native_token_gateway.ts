import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../../helpers/address'

const {NATIVE_TOKEN_ADDRESS} = Address

const NativeTokenGateway = 'NativeTokenGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy} = deployments
  const {deployer, governor} = await getNamedAccounts()

  await deploy(NativeTokenGateway, {
    from: deployer,
    log: true,
    args: [NATIVE_TOKEN_ADDRESS],
  })

  await execute(NativeTokenGateway, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [NativeTokenGateway]
