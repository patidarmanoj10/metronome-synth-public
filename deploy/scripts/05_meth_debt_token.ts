import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic, UpgradableContracts} from '../helpers'

const {alias: MEthDebtToken} = UpgradableContracts.MEthDebtToken

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)

  const {deploy} = await deterministic(hre, UpgradableContracts.MEthDebtToken)

  await deploy()

  await execute(MEthDebtToken, {from: deployer, log: true}, 'initialize', 'mETH Debt', 'mETH-Debt', 18, issuerAddress)
  await execute(MEthDebtToken, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MEthDebtToken]