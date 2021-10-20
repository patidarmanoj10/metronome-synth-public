import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic, UpgradableContracts} from '../helpers'
import Address from '../../helpers/address'

const {MET_ADDRESS} = Address
const {alias: Treasury} = UpgradableContracts.Treasury

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: mBoxAddress} = await deterministic(hre, UpgradableContracts.MBox)
  const {deploy} = await deterministic(hre, UpgradableContracts.Treasury)

  await deploy()

  await execute(Treasury, {from: deployer, log: true}, 'initialize', MET_ADDRESS, mBoxAddress)
  await execute(Treasury, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [Treasury]