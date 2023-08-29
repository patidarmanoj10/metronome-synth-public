import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'

const {
  Pool: {alias: Pool},
  Treasury: {alias: Treasury},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const pool = await get(Pool)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury,
    initializeArgs: [pool.address],
  })

  await updateParamIfNeeded(hre, {
    contract: Pool,
    readMethod: 'treasury',
    writeMethod: 'updateTreasury',
    newValue: treasuryAddress,
  })
}

export default func
func.tags = [Treasury]
func.dependencies = [Pool]
