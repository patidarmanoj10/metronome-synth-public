import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable} from '../../helpers'

const {
  Pool: {alias: Pool},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre
  const {get, read, execute} = deployments
  const {deployer: from} = await getNamedAccounts()

  const poolRegistry = await get(PoolRegistry)

  const {address: poolAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Pool,
    initializeArgs: [poolRegistry.address],
  })

  const isRegistered = await read(PoolRegistry, 'isPoolRegistered', poolAddress)

  if (!isRegistered) {
    await execute(PoolRegistry, {from, log: true}, 'registerPool', poolAddress)
  }
}

export default func
func.tags = [Pool]
