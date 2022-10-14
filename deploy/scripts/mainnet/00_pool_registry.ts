import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, transferGovernorshipIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'
const {MASTER_ORACLE_ADDRESS} = Address

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {read, execute} = deployments
  const {deployer: from} = await getNamedAccounts()
  const {getOrNull} = deployments

  const wasDeployed = !!(await getOrNull(PoolRegistry))

  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.PoolRegistry,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS, Address.FEE_COLLECTOR],
  })

  if (!wasDeployed) {
    await transferGovernorshipIfNeeded(hre, PoolRegistry)
  }

  if ((await read(PoolRegistry, 'masterOracle')) !== MASTER_ORACLE_ADDRESS) {
    await execute(PoolRegistry, {from, log: true}, 'updateMasterOracle', MASTER_ORACLE_ADDRESS)
  }
}

export default func
func.tags = [PoolRegistry]
