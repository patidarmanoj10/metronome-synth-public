import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'
import Address from '../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {MET_ADDRESS} = Address
const {
  MetDepositToken: {alias: MetDepositToken},
  Controller: {alias: Controller},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)
  const {deploy} = await deterministic(hre, UpgradableContracts.MetDepositToken)

  const {address: depositTokenAddress} = await deploy()

  const symbol = 'vsMET-Deposit'
  const decimals = 18 // Same as MET

  await execute(
    MetDepositToken,
    {from: deployer, log: true},
    'initialize',
    MET_ADDRESS,
    controllerAddress,
    symbol,
    decimals,
    parseEther('0.67') // CR = 67%
  )

  await execute(Controller, {from: deployer, log: true}, 'addDepositToken', depositTokenAddress)
}

export default func
func.tags = [MetDepositToken]
