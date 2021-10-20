import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'
import Address from '../../helpers/address'

const {MET_ADDRESS} = Address
const {alias: DepositToken} = UpgradableContracts.DepositToken

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)
  const {deploy} = await deterministic(hre, UpgradableContracts.DepositToken)

  await deploy()

  await execute(DepositToken, {from: deployer, log: true}, 'initialize', MET_ADDRESS, issuerAddress)
  await execute(DepositToken, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [DepositToken]
