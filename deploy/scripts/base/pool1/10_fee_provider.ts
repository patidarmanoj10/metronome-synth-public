/* eslint-disable camelcase */
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {parseEther} from 'ethers/lib/utils'
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

  const {address: msUSD} = await get('MsUSDSynthetic')
  const {address: msETH} = await get('MsETHSynthetic')

  await updateParamIfNeeded(hre, {
    contractAlias: FeeProvider_Pool1,
    readMethod: 'swapFees',
    readArgs: [msUSD, msETH],
    writeMethod: 'updateSwapFee',
    writeArgs: [msUSD, msETH, parseEther('0.01').toString()], // 1%
    isCurrentValueUpdated: (current, writeArgs) => current.toString() === writeArgs[2].toString(),
  })

  await updateParamIfNeeded(hre, {
    contractAlias: FeeProvider_Pool1,
    readMethod: 'swapFees',
    readArgs: [msETH, msUSD],
    writeMethod: 'updateSwapFee',
    writeArgs: [msETH, msUSD, parseEther('0.0035').toString()], // 0.35%
    isCurrentValueUpdated: (current, writeArgs) => current.toString() === writeArgs[2].toString(),
  })
}

export default func
func.tags = [FeeProvider_Pool1]
func.dependencies = [Pool1, 'MsUSDSynthetic', 'MsETHSynthetic']
