import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../helpers/address'
import {deterministic, UpgradableContracts} from '../helpers'

const {WETH_ADDRESS} = Address

const WETHGateway = 'WETHGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy} = deployments
  const {deployer} = await getNamedAccounts()

  await deploy(WETHGateway, {
    from: deployer,
    log: true,
    args: [WETH_ADDRESS],
  })

  const {address: vSynthAddress} = await deterministic(hre, UpgradableContracts.VSynth)

  await execute(WETHGateway, {from: deployer, log: true}, 'authorizeVSynth', vSynthAddress)
}

export default func
func.tags = [WETHGateway]
