import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {toUSD} from '../../../helpers'

const {BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth BTC',
  symbol: 'msBTC',
  decimals: 8,
  interestRate: parseEther('0'), // 0%
  maxTotalSupplyInUsd: toUSD('50000'),
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 12, // 12h
    },
  },
})

export default func
