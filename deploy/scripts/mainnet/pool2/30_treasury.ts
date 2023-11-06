/* eslint-disable camelcase */
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'

const {
  Pool2: {alias: Pool},
  Treasury_Pool2: {alias: Treasury_Pool2},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const pool = await get(Pool)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury_Pool2,
    initializeArgs: [pool.address],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: Pool,
    readMethod: 'treasury',
    writeMethod: 'updateTreasury',
    writeArgs: [treasuryAddress],
  })
}

export default func
func.tags = [Treasury_Pool2]
func.dependencies = [Pool]
