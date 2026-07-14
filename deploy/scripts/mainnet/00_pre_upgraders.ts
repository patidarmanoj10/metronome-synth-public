import chalk from 'chalk'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {
  executeBatchUsingMultisig,
  getPendingTxsForMultiSigExecution,
  saveForMultiSigBatchExecution,
} from '../../helpers/safe'
import Address from '../../../helpers/address'

const {log} = console

const {GNOSIS_SAFE_ADDRESS} = Address

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, getOrNull, execute, catchUnknownSigner} = deployments
  const {deployer} = await getNamedAccounts()

  const upgraders: {currentUpgrader: string; newUpgrader: string; targetProxies: string[]}[] = [
    {
      currentUpgrader: 'PoolRegistryUpgraderV2',
      newUpgrader: 'PoolRegistryUpgraderV3',
      targetProxies: ['PoolRegistry'],
    },
    {
      currentUpgrader: 'SmartFarmingManagerUpgrader',
      newUpgrader: 'SmartFarmingManagerUpgraderV2',
      targetProxies: ['SmartFarmingManager_Pool1', 'SmartFarmingManager_Pool2'],
    },
    {
      currentUpgrader: 'FeeProviderUpgrader',
      newUpgrader: 'FeeProviderUpgraderV2',
      targetProxies: ['FeeProvider_Pool1', 'FeeProvider_Pool2'],
    },
  ]

  for (const {currentUpgrader, newUpgrader, targetProxies: proxies} of upgraders) {
    // Skip if no target proxies exist yet (e.g., fresh deployment)
    const anyProxyExists = (await Promise.all(proxies.map((p) => getOrNull(p)))).some(Boolean)
    if (!anyProxyExists) {
      log(chalk.yellow(`No target proxies found for ${newUpgrader} migration, skipping...`))
      continue
    }

    // 1. Deploy new version of upgrader
    const alreadyDeployed = !!(await getOrNull(newUpgrader))

    if (alreadyDeployed) {
      continue
    }

    const {address: newAdmin} = await deploy(newUpgrader, {
      from: deployer,
      log: true,
      args: [deployer],
    })

    // 2. Set correct ownership
    await execute(newUpgrader, {from: deployer, log: true}, 'transferOwnership', GNOSIS_SAFE_ADDRESS)

    // 3. Set the new upgrader as proxy(ies)'s admin
    for (const contract of proxies) {
      const {address: proxyAddress} = await get(contract)

      const multiSigTx = await catchUnknownSigner(
        execute(currentUpgrader, {from: GNOSIS_SAFE_ADDRESS, log: true}, 'changeProxyAdmin', proxyAddress, newAdmin),
        {
          log: true,
        }
      )

      if (multiSigTx) {
        await saveForMultiSigBatchExecution(multiSigTx)
      }
    }
  }

  const pendingTxs = getPendingTxsForMultiSigExecution()

  if (pendingTxs.length > 0) {
    await executeBatchUsingMultisig(hre)

    log(chalk.green('---------------------------------------------------------------------------------------'))
    log(chalk.green(''))
    log(chalk.green('A Safe tx was proposed it must to be executed before running the deployment again.'))
    log(chalk.green(''))
    log(chalk.green('---------------------------------------------------------------------------------------'))

    process.exit()
  }
}

export default func
func.tags = ['Upgraders']
