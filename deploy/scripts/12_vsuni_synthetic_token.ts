import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../helpers'
import Address from '../../helpers/address'

const {UNI_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth UNI',
  symbol: 'vsUNI',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: UNI_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 12, // 6h
    },
  },
  salt: '0x03',
})

export default func
