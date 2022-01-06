import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {parseEther} from 'ethers/lib/utils'
import {UpgradableContracts, deterministic} from '../helpers'

const {
  Controller: {alias: Controller},
  VsEthDebtToken: {alias: VsEthDebtToken},
  VsEth: {alias: VsEth},
} = UpgradableContracts

const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {get, execute} = deployments
  const {deployer} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)
  const {address: vsEthDebtTokenAddress} = await deterministic(hre, UpgradableContracts.VsEthDebtToken)
  const {deploy} = await deterministic(hre, UpgradableContracts.VsEth)

  const {address: syntheticAssetAddress} = await deploy()

  await execute(
    VsEth,
    {from: deployer, log: true},
    'initialize',
    'Vesper Synth ETH',
    'vsETH',
    18,
    controllerAddress,
    vsEthDebtTokenAddress,
    parseEther('1.5'), // CR = 150%
    oracle.address,
    parseEther('0') // Interest Rate = 0%
  )

  await execute(Controller, {from: deployer, log: true}, 'addSyntheticAsset', syntheticAssetAddress)
}

export default func
func.tags = [VsEth]
func.dependencies = [VsEthDebtToken]
