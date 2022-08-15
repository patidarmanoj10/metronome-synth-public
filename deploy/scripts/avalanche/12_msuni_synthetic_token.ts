import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {toUSD} from '../../../helpers'

const {UNI_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth UNI',
  symbol: 'msUNI',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupplyInUsd: toUSD('50000'),
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: UNI_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 12, // 6h
    },
  },
})

export default func
