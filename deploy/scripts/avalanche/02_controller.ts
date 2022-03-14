import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../../helpers'

const {alias: Controller} = UpgradableContracts.Controller
const MasterOracle = 'MasterOracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const masterOracle = await get(MasterOracle)

  const {address: treasuryAddress} = await deterministic(hre, UpgradableContracts.Treasury)

  const {deploy} = await deterministic(hre, UpgradableContracts.Controller)
  await deploy()

  await execute(Controller, {from: deployer, log: true}, 'initialize', masterOracle.address, treasuryAddress)
  await execute(Controller, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [Controller]
func.dependencies = [MasterOracle]
