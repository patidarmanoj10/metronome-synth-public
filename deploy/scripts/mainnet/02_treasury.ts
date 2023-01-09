import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'

const {
  Pool: {alias: Pool},
  Treasury: {alias: Treasury},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get, read} = deployments
  const {deployer} = await getNamedAccounts()

  const pool = await get(Pool)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury,
    initializeArgs: [pool.address],
  })

  const currentTreasury = await read(Pool, 'treasury')

  if (currentTreasury !== treasuryAddress) {
    await execute(Pool, {from: deployer, log: true}, 'updateTreasury', treasuryAddress)
  }
}

export default func
func.tags = [Treasury]
func.dependencies = [Pool]
