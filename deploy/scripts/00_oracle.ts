import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'
import Address from '../../helpers/address'

const {MET_ADDRESS, WETH_ADDRESS, UNISWAP_V2_ROUTER02_ADDRESS, UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS, DAI_ADDRESS} =
  Address

const TWAP_PERIOD = 60 * 60 * 2 // 2 hours
const STALE_PERIOD = 60 * 15 // 15 minutes

const Oracle = 'Oracle'

const Protocol = {
  NONE: 0,
  UNISWAP_V3: 1,
  UNISWAP_V2: 2,
  CHAINLINK: 3,
}

const {UNISWAP_V3, UNISWAP_V2, CHAINLINK} = Protocol

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {execute, deploy} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const uniswapV3PriceProvider = await deploy('UniswapV3PriceProvider', {
    from: deployer,
    log: true,
    args: [UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS, DAI_ADDRESS, TWAP_PERIOD],
  })

  const uniswapV2PriceProvider = await deploy('UniswapV2PriceProvider', {
    from: deployer,
    log: true,
    args: [UNISWAP_V2_ROUTER02_ADDRESS, DAI_ADDRESS, TWAP_PERIOD],
  })

  const chainlinkPriceProvider = await deploy('ChainlinkPriceProvider', {
    from: deployer,
    log: true,
  })

  await deploy(Oracle, {
    from: deployer,
    log: true,
    args: [STALE_PERIOD],
  })

  await execute(Oracle, {from: deployer, log: true}, 'transferGovernorship', governor)

  await execute(Oracle, {from: deployer, log: true}, 'setPriceProvider', UNISWAP_V3, uniswapV3PriceProvider.address)
  await execute(Oracle, {from: deployer, log: true}, 'setPriceProvider', UNISWAP_V2, uniswapV2PriceProvider.address)
  await execute(Oracle, {from: deployer, log: true}, 'setPriceProvider', CHAINLINK, chainlinkPriceProvider.address)

  await execute(Oracle, {from: deployer, log: true}, 'addOrUpdateUsdAsset', DAI_ADDRESS)

  const {address: vsEthAddress} = await deterministic(hre, UpgradableContracts.VsEth)
  await execute(Oracle, {from: deployer, log: true}, 'addOrUpdateAssetThatUsesUniswapV2', vsEthAddress, WETH_ADDRESS)

  // For `depositToken` we use its underlying asset on querying
  await execute(Oracle, {from: deployer, log: true}, 'addOrUpdateAssetThatUsesUniswapV3', MET_ADDRESS, MET_ADDRESS)
}

export default func
func.tags = [Oracle]
