import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts} from '../helpers'

const {
  Controller: {alias: Controller},
  Treasury: {alias: Treasury},
  MetDepositToken: {alias: MetDepositToken},
  VsEthDebtToken: {alias: VsEthDebtToken},
  VsEth: {alias: VsEth},
} = UpgradableContracts

const WETHGateway = 'WETHGateway'
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  // Note: We probably want to have the governor set in one place only
  // Refs: https://github.com/bloqpriv/vesper-synth/issues/197
  await execute(Oracle, {from: deployer, log: true}, 'transferGovernorship', governor)
  await execute(Controller, {from: deployer, log: true}, 'transferGovernorship', governor)
  await execute(Treasury, {from: deployer, log: true}, 'transferGovernorship', governor)
  await execute(WETHGateway, {from: deployer, log: true}, 'transferGovernorship', governor)
  await execute(MetDepositToken, {from: deployer, log: true}, 'transferGovernorship', governor)
  await execute(VsEthDebtToken, {from: deployer, log: true}, 'transferGovernorship', governor)
  await execute(VsEth, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
