import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'
import Address from '../../helpers/address'

const {VSP_ADDRESS} = Address
const {
  Controller: {alias: Controller},
  VspRewardsDistributor: {alias: VspRewardsDistributor},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)
  const {deploy} = await deterministic(hre, UpgradableContracts.VspRewardsDistributor)

  const {address: rewardsDistributorAddress} = await deploy()

  await execute(VspRewardsDistributor, {from: deployer, log: true}, 'initialize', controllerAddress, VSP_ADDRESS)

  await execute(Controller, {from: deployer, log: true}, 'addRewardsDistributor', rewardsDistributorAddress)
}

export default func
func.tags = [VspRewardsDistributor]
