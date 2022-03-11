import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../helpers'
import Address from '../../helpers/address'

const {BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth BTC',
  symbol: 'vsBTC',
  decimals: 8,
  interestRate: parseEther('0'), // 0%
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 12, // 12h
    },
  },
  salt: '0x01',
})

export default func
