import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth UNI',
  symbol: 'msUNI',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupply: parseEther('71500'),
})

export default func
