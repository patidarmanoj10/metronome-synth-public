import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'

/**
 * This script is used when need to upgrade an Upgrader contract
 * Must be placed just before the target contract
 * Must be deleted after the execution
 */
const Contract = 'Pool'
const CurrentUpgrader = 'PoolUpgrader'
const NewUpgrader = 'PoolUpgraderV2'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, execute} = deployments
  const {deployer: from} = await getNamedAccounts()
  const {address: proxyAddress} = await get(Contract)
  const {address: newAdmin} = await deploy(NewUpgrader, {
    from,
    log: true,
    args: [from],
  })

  await execute(CurrentUpgrader, {from, log: true}, 'changeProxyAdmin', proxyAddress, newAdmin)
}

export default func
func.tags = [CurrentUpgrader]
