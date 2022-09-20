import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'

const {
  Pool: {alias: Pool},
  Treasury: {alias: Treasury},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get, getOrNull} = deployments
  const {deployer} = await getNamedAccounts()

  const wasDeployed = !!(await getOrNull(Treasury))

  const pool = await get(Pool)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury,
    initializeArgs: [pool.address],
  })

  if (!wasDeployed) {
    await execute(Pool, {from: deployer, log: true}, 'updateTreasury', treasuryAddress)
  }
}

export default func
func.tags = [Treasury]
func.dependencies = [Pool]
