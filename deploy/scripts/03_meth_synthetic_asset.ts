import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {parseEther} from 'ethers/lib/utils'
import {deterministic} from '../helpers'

const {WETH_ADDRESS} = process.env

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (!WETH_ADDRESS) {
    throw Error('process.env.WETH_ADDRESS undefined!')
  }

  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: mBoxAddress} = await deterministic(hre, 'MBox')

  const {deploy: deployMEthSyntheticAsset} = await deterministic(hre, 'mETH_SyntheticAsset', 'SyntheticAsset')

  const {address: mEthDebtTokenAddress} = await deterministic(hre, 'mETH_DebtToken', 'DebtToken')

  await deployMEthSyntheticAsset()

  await execute(
    'mETH_SyntheticAsset',
    {from: deployer, log: true},
    'initialize',
    'Metronome ETH',
    'mETH',
    mBoxAddress,
    WETH_ADDRESS,
    mEthDebtTokenAddress,
    parseEther('1.5') // CR = 150%
  )

  await execute('mETH_SyntheticAsset', {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = ['mETH_SyntheticAsset']
