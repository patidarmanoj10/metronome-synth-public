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

  const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)

  await execute(WETHGateway, {from: deployer, log: true}, 'authorizeController', controllerAddress)
}

export default func
func.tags = [WETHGateway]
