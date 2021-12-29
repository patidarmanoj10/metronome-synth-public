import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: Issuer} = UpgradableContracts.Issuer
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, get} = deployments
  const {deployer} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: vSynthAddress} = await deterministic(hre, UpgradableContracts.VSynth)
  const {address: treasuryAddress} = await deterministic(hre, UpgradableContracts.Treasury)

  const {deploy} = await deterministic(hre, UpgradableContracts.Issuer)
  await deploy()

  await execute(Issuer, {from: deployer, log: true}, 'initialize', oracle.address, treasuryAddress, vSynthAddress)
}

export default func
func.tags = [Issuer]
func.dependencies = [Oracle]
