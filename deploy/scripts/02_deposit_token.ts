import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic} from '../helpers'

const {MET_ADDRESS} = process.env

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (!MET_ADDRESS) {
    throw Error('process.env.MET_ADDRESS undefined!')
  }

  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: mBoxAddress} = await deterministic(hre, 'MBox')

  const {deploy: deployDepositToken} = await deterministic(hre, 'DepositToken')

  await deployDepositToken()

  await execute('DepositToken', {from: deployer, log: true}, 'initialize', MET_ADDRESS, mBoxAddress)
  await execute('DepositToken', {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = ['DepositToken']
