import fs from 'fs'
import {task} from 'hardhat/config'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

task('update-owner-and-governor', 'Update owner and governor').setAction(
  async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const GNOSIS_SAFE_ADDRESS = '0xE01Df4ac1E1e57266900E62C37F12C986495A618'

    const {read, execute} = hre.deployments
    const {deployer} = await hre.getNamedAccounts()

    const network = hre.network.name
    const networkDir = `./deployments/${network}`

    // PoolRegistry, Pool1, ..., PoolN
    const governable = fs
      .readdirSync(networkDir)
      .filter((f) => f.includes('Proxy'))
      .filter((f) => f.match(/^Pool/))
      .map((f) => f.split('_')[0])

    for (const alias of governable) {
      const current = await read(alias, 'governor')

      if (current != GNOSIS_SAFE_ADDRESS) {
        await execute(alias, {from: deployer, log: true}, 'transferGovernorship', GNOSIS_SAFE_ADDRESS)
      }
    }

    // *Upgrader
    const ownable = fs
      .readdirSync(networkDir)
      .filter((f) => f.includes('Upgrader'))
      .map((f) => f.split('.')[0])

    for (const alias of ownable) {
      const current = await read(alias, 'owner')

      if (current != GNOSIS_SAFE_ADDRESS) {
        await execute(alias, {from: deployer, log: true}, 'transferOwnership', GNOSIS_SAFE_ADDRESS)
      }
    }
  }
)
