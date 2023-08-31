import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'
import Address from '../../../helpers/address'

const {OP_ADDRESS} = Address

const {
  Pool: {alias: Pool},
  OpRewardsDistributor: {alias: RewardsDistributor},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments
  const pool = await get(Pool)

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.OpRewardsDistributor,
    initializeArgs: [pool.address, OP_ADDRESS],
  })
}

export default func
func.tags = [RewardsDistributor]
func.dependencies = [Pool]
