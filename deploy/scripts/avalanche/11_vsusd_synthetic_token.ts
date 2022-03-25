import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../../helpers'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth USD',
  symbol: 'vsUSD',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupplyInUsd: toUSD('50000'),
  oracle: {function: 'addOrUpdateUsdAsset'},
})

export default func
