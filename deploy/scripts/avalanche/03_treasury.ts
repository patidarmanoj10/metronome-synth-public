import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic, UpgradableContracts} from '../../helpers'

const {alias: Treasury} = UpgradableContracts.Treasury

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)
  const {deploy} = await deterministic(hre, UpgradableContracts.Treasury)

  await deploy()

  await execute(Treasury, {from: deployer, log: true}, 'initialize', controllerAddress)
}

export default func
func.tags = [Treasury]
