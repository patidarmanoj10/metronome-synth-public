import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../../helpers'

const {USDT_ADDRESS, USDT_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: USDT_ADDRESS,
  underlyingSymbol: 'USDT',
  underlyingDecimals: 6,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupplyInUsd: toUSD('100000'),
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: USDT_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 24, // 24h
    },
  },
  salt: '0x05',
})

export default func
