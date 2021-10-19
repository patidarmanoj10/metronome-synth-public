import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: MBox} = UpgradableContracts.MBox

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const oracle = await get('Oracle')

  const {address: treasuryAddress} = await deterministic(hre, UpgradableContracts.Treasury)
  const {address: depositTokenAddress} = await deterministic(hre, UpgradableContracts.DepositToken)
  const {address: mEthAddress} = await deterministic(hre, UpgradableContracts.MEth)

  const {deploy: deployMBox} = await deterministic(hre, UpgradableContracts.MBox)
  await deployMBox()

  await execute(MBox, {from: deployer, log: true}, 'initialize', treasuryAddress, depositTokenAddress, oracle.address)
  await execute(MBox, {from: deployer, log: true}, 'addSyntheticAsset', mEthAddress)
  await execute(MBox, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MBox]
