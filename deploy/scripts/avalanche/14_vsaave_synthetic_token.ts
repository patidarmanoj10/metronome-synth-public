import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {toUSD} from '../../../helpers'

const {AAVE_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth AAVE',
  symbol: 'vsAAVE',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupplyInUsd: toUSD('50000'),
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: AAVE_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 12, // 6h
    },
  },
  salt: '0x05',
})

export default func
