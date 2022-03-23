import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../../helpers'

const {WETH_ADDRESS, ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupplyInUsd: toUSD('100000'),
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 6, // 6h
    },
  },
})

export default func
