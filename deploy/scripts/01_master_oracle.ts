import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const DefaultOracle = 'DefaultOracle'
const {alias: MasterOracle} = UpgradableContracts.MasterOracle

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const defaultOracle = await get(DefaultOracle)

  const {deploy} = await deterministic(hre, UpgradableContracts.MasterOracle)
  await deploy()

  await execute(MasterOracle, {from: deployer, log: true}, 'initialize', [], [], defaultOracle.address)
  await execute(MasterOracle, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MasterOracle]
