import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: VSynth} = UpgradableContracts.VSynth
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)
  const {address: metDepositTokenAddress} = await deterministic(hre, UpgradableContracts.MetDepositToken)

  const {deploy} = await deterministic(hre, UpgradableContracts.VSynth)
  await deploy()

  await execute(
    VSynth,
    {from: deployer, log: true},
    'initialize',
    metDepositTokenAddress,
    oracle.address,
    issuerAddress
  )
  await execute(VSynth, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [VSynth]
func.dependencies = [Oracle]
