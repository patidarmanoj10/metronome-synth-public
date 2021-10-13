import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic} from '../helpers'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy} = deployments
  const {deployer, governor} = await getNamedAccounts()

  // TODO: Replace with proper implementation
  // See: https://github.com/bloqpriv/mbox/issues/9
  const {address: oracleAddress} = await deploy('Oracle', {
    contract: 'OracleMock',
    from: deployer,
    log: true,
  })

  const {address: treasuryAddress} = await deterministic(hre, 'Treasury')
  const {address: depositTokenAddress} = await deterministic(hre, 'DepositToken')
  const {address: mEthAddress} = await deterministic(hre, 'mETH_SyntheticAsset', 'SyntheticAsset')

  const {deploy: deployMBox} = await deterministic(hre, 'MBox')
  await deployMBox()

  await execute('MBox', {from: deployer, log: true}, 'initialize', treasuryAddress, depositTokenAddress, oracleAddress)
  await execute('MBox', {from: deployer, log: true}, 'addSyntheticAsset', mEthAddress)
  await execute('MBox', {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = ['MBox']
