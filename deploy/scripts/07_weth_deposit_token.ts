import {buildDepositDeployFunction} from '../helpers'
import Address from '../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WETH_ADDRESS, ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 6, // 6h
    },
  },
  salt: '0x03',
})

export default func
