/* eslint-disable camelcase */
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../../helpers'
import {ethers} from 'hardhat'

const {
  Pool1: {alias: Pool1},
  FeeProvider_Pool1: {alias: FeeProvider_Pool1},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: feeProviderAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.FeeProvider_Pool1,
    initializeArgs: [poolRegistryAddress, ethers.constants.AddressZero],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: Pool1,
    readMethod: 'feeProvider',
    writeMethod: 'updateFeeProvider',
    writeArgs: [feeProviderAddress],
  })
}

export default func
func.tags = [FeeProvider_Pool1]
func.dependencies = [Pool1]
