import chalk from 'chalk'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'
import Address from '../../../helpers/address'

const {log} = console

const {GNOSIS_SAFE_ADDRESS} = Address

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, getOrNull, execute, catchUnknownSigner} = deployments
  const {deployer} = await getNamedAccounts()

  // Note: Keep this array empty if there isn't upgrader contract to upgrade
  const upgraders: {currentUpgrader: string; newUpgrader: string; targetProxies: string[]}[] = [
    {
      currentUpgrader: 'ProxyOFTUpgrader',
      newUpgrader: 'ProxyOFTUpgraderV2',
      targetProxies: ['MsETHProxyOFT', 'MsUSDProxyOFT'],
    },
  ]

  for (const {currentUpgrader, newUpgrader, targetProxies: proxies} of upgraders) {
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

    log(chalk.green('---------------------------------------------------------------------------------------'))
    log(chalk.green(''))
    log(chalk.green(`Set ${newUpgrader} in the 'deploy/helpers/index.ts' file (UpgradableContracts object)`))
    log(chalk.green(''))
    log(chalk.green('---------------------------------------------------------------------------------------'))

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
}

export default func
func.tags = ['Upgraders']
