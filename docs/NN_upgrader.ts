import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {executeUsingMultiSig} from '../../helpers/multisig-helpers'
import Address from '../../../helpers/address'

/**
 * This script is used when need to upgrade an Upgrader contract
 * Must be placed just before the target contract
 * Must be deleted after the execution
 */

const {GNOSIS_SAFE_ADDRESS} = Address

// Change values below
const Contract = 'Pool'
const CurrentUpgrader = 'PoolUpgrader'
const NewUpgrader = 'PoolUpgraderV2'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, getOrNull, execute, catchUnknownSigner} = deployments
  const {deployer} = await getNamedAccounts()
  const {address: proxyAddress} = await get(Contract)

  const alreadyDeployed = !!(await getOrNull(NewUpgrader))

  if (alreadyDeployed) {
    return
  }

  const {address: newAdmin} = await deploy(NewUpgrader, {
    from: deployer,
    log: true,
    args: [deployer],
  })

  await execute(NewUpgrader, {from: deployer, log: true}, 'transferOwnership', GNOSIS_SAFE_ADDRESS)

  const multiSigTx = await catchUnknownSigner(
    execute(CurrentUpgrader, {from: GNOSIS_SAFE_ADDRESS, log: true}, 'changeProxyAdmin', proxyAddress, newAdmin),
    {
      log: true,
    }
  )

  if (multiSigTx) {
    await executeUsingMultiSig(hre, multiSigTx)
  }
}

export default func
func.tags = [CurrentUpgrader]
