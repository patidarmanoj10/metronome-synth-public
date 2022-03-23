import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'

const MasterOracle = 'MasterOracle'
const {
  Controller: {alias: Controller},
  Treasury: {alias: Treasury},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const masterOracle = await get(MasterOracle)

  const {address: controllerAddress} = await deployUpgradable(hre, UpgradableContracts.Controller)

  const {address: treasuryAddress} = await deployUpgradable(hre, UpgradableContracts.Treasury)

  await execute(Treasury, {from: deployer, log: true}, 'initialize', controllerAddress)
  await execute(Controller, {from: deployer, log: true}, 'initialize', masterOracle.address, treasuryAddress)
  await execute(Controller, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [Controller]
func.dependencies = [MasterOracle]
