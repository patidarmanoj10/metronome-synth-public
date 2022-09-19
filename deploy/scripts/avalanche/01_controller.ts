import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  PoolRegistry: {alias: PoolRegistry},
  Controller: {alias: Controller},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {getOrNull, execute} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(Controller))

  const {address: poolAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Controller,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, Controller)
    await execute(PoolRegistry, {from: deployer, log: true}, 'registerPool', poolAddress)
  }
}

export default func
func.dependencies = [PoolRegistry]
func.tags = [Controller]
