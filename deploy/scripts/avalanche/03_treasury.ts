import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'

const {
  Controller: {alias: Controller},
  Treasury: {alias: Treasury},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(Treasury))

  const controller = await get(Controller)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury,
    initializeArgs: [controller.address],
  })

  if (!wasDeployed) {
    await execute(Controller, {from: deployer, log: true}, 'updateTreasury', treasuryAddress, false)
  }
}

export default func
func.tags = [Treasury]
func.dependencies = [Controller]
