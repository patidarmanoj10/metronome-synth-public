import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupply: parseEther('50000'),
})

export default func
