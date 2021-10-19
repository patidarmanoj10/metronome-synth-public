import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {parseEther} from 'ethers/lib/utils'
import {Contracts, deterministic} from '../helpers'

const {WETH_ADDRESS} = process.env
const {alias: MEth} = Contracts.MEth

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (!WETH_ADDRESS) {
    throw Error('process.env.WETH_ADDRESS undefined!')
  }

  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const {address: mBoxAddress} = await deterministic(hre, Contracts.MBox)
  const {address: mEthDebtTokenAddress} = await deterministic(hre, Contracts.MEthDebtToken)
  const {deploy} = await deterministic(hre, Contracts.MEth)

  await deploy()

  await execute(
    MEth,
    {from: deployer, log: true},
    'initialize',
    'Metronome ETH',
    'mETH',
    mBoxAddress,
    WETH_ADDRESS,
    mEthDebtTokenAddress,
    parseEther('1.5') // CR = 150%
  )

  await execute(MEth, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MEth]
