import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: Issuer} = UpgradableContracts.Issuer
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: mBoxAddress} = await deterministic(hre, UpgradableContracts.MBox)
  const {address: metDepositTokenAddress} = await deterministic(hre, UpgradableContracts.MetDepositToken)
  const {address: mEthAddress} = await deterministic(hre, UpgradableContracts.MEth)

  const {deploy} = await deterministic(hre, UpgradableContracts.Issuer)
  await deploy()

  await execute(
    Issuer,
    {from: deployer, log: true},
    'initialize',
    metDepositTokenAddress,
    mEthAddress,
    oracle.address,
    mBoxAddress
  )
  await execute(Issuer, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [Issuer]
func.dependencies = [Oracle]
