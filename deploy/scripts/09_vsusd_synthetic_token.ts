import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth USD',
  symbol: 'vsUSD',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  oracle: {function: 'addOrUpdateUsdAsset', args: []},
  salt: '0x02',
})

export default func
