import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {deterministic, UpgradableContracts} from '../helpers'

const {alias: VsEthDebtToken} = UpgradableContracts.VsEthDebtToken

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)
  const {address: vsEthAddress} = await deterministic(hre, UpgradableContracts.VsEth)

  const {deploy} = await deterministic(hre, UpgradableContracts.VsEthDebtToken)

  await deploy()

  await execute(
    VsEthDebtToken,
    {from: deployer, log: true},
    'initialize',
    'vsETH Debt',
    'vsETH-Debt',
    18,
    issuerAddress,
    vsEthAddress
  )
  await execute(VsEthDebtToken, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [VsEthDebtToken]
