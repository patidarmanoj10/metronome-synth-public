import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic} from '../helpers'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: mBoxAddress} = await deterministic(hre, 'MBox')

  const {deploy: deployMEthDebtToken} = await deterministic(hre, 'mETH_DebtToken', 'DebtToken')

  await deployMEthDebtToken()

  await execute('mETH_DebtToken', {from: deployer, log: true}, 'initialize', 'mETH Debt', 'mETH-Debt', mBoxAddress)
  await execute('mETH_DebtToken', {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = ['mEth_DebtToken']
