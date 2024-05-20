/* eslint-disable camelcase */
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'

const {
  Pool1: {alias: Pool1},
  Treasury_Pool1: {alias: Treasury_Pool1},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const pool = await get(Pool1)

  const {address: treasuryAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Treasury_Pool1,
    initializeArgs: [pool.address],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: Pool1,
    readMethod: 'treasury',
    writeMethod: 'updateTreasury',
    writeArgs: [treasuryAddress],
  })
}

export default func
func.tags = [Treasury_Pool1]
func.dependencies = [Pool1]
