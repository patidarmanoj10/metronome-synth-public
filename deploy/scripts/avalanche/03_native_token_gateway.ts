import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../../helpers/address'
import {transferGovernorshipIfNeeded} from '../../helpers'

const {NATIVE_TOKEN_ADDRESS} = Address

const NativeTokenGateway = 'NativeTokenGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(NativeTokenGateway))

  await deploy(NativeTokenGateway, {
    from: deployer,
    log: true,
    args: [NATIVE_TOKEN_ADDRESS],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, NativeTokenGateway)
  }
}

export default func
func.tags = [NativeTokenGateway]
