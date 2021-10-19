import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic, Contracts} from '../helpers'

const {alias: MEthDebtToken} = Contracts.MEthDebtToken

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: mBoxAddress} = await deterministic(hre, Contracts.MBox)

  const {deploy: deployMEthDebtToken} = await deterministic(hre, Contracts.MEthDebtToken)

  await deployMEthDebtToken()

  await execute(MEthDebtToken, {from: deployer, log: true}, 'initialize', 'mETH Debt', 'mETH-Debt', mBoxAddress)
  await execute(MEthDebtToken, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MEthDebtToken]
