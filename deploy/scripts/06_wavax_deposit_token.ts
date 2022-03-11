import {buildDepositDeployFunction} from '../helpers'
import Address from '../../helpers/address'
import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../helpers'

const {WAVAX_ADDRESS, AVAX_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WAVAX_ADDRESS,
  underlyingSymbol: 'WAVAX',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupplyInUsd: toUSD('100000'),
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: AVAX_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 5, // 5m - The AVAX's heartbeat on Avalanche is 2m
    },
  },
  salt: '0x02',
})

export default func
