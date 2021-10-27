import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic, UpgradableContracts} from '../helpers'

const {alias: MEthDebtToken} = UpgradableContracts.MEthDebtToken

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)

  const {deploy: deployMEthDebtToken} = await deterministic(hre, UpgradableContracts.MEthDebtToken)

  await deployMEthDebtToken()

  await execute(MEthDebtToken, {from: deployer, log: true}, 'initialize', 'mETH Debt', 'mETH-Debt', issuerAddress)
  await execute(MEthDebtToken, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MEthDebtToken]