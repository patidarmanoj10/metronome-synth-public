import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: MBox} = UpgradableContracts.MBox
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)
  const {address: treasuryAddress} = await deterministic(hre, UpgradableContracts.Treasury)
  const {address: depositTokenAddress} = await deterministic(hre, UpgradableContracts.DepositToken)

  const {deploy} = await deterministic(hre, UpgradableContracts.MBox)
  await deploy()

  await execute(
    MBox,
    {from: deployer, log: true},
    'initialize',
    treasuryAddress,
    depositTokenAddress,
    oracle.address,
    issuerAddress
  )
  await execute(MBox, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MBox]
func.dependencies = [Oracle]
