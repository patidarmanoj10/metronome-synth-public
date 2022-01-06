import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: Controller} = UpgradableContracts.Controller
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: treasuryAddress} = await deterministic(hre, UpgradableContracts.Treasury)

  const {deploy} = await deterministic(hre, UpgradableContracts.Controller)
  await deploy()

  await execute(Controller, {from: deployer, log: true}, 'initialize', oracle.address, treasuryAddress)
}

export default func
func.tags = [Controller]
func.dependencies = [Oracle]
