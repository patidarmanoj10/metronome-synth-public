import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {parseEther} from 'ethers/lib/utils'
import {UpgradableContracts, deterministic} from '../helpers'

const {alias: VsEth} = UpgradableContracts.VsEth
const {alias: VsEthDebtToken} = UpgradableContracts.VsEthDebtToken
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {get, execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)
  const {address: vsEthDebtTokenAddress} = await deterministic(hre, UpgradableContracts.VsEthDebtToken)
  const {deploy} = await deterministic(hre, UpgradableContracts.VsEth)

  await deploy()

  await execute(
    VsEth,
    {from: deployer, log: true},
    'initialize',
    'Vesper Synth ETH',
    'vsETH',
    18,
    issuerAddress,
    vsEthDebtTokenAddress,
    parseEther('1.5'), // CR = 150%
    oracle.address,
    parseEther('0') // Interest Rate = 0%
  )

  await execute(VsEth, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [VsEth]
func.dependencies = [VsEthDebtToken]
