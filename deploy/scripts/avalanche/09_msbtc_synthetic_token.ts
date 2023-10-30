import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth BTC',
  symbol: 'msBTC',
  decimals: 8,
  interestRate: parseEther('0'), // 0%
  maxTotalSupply: parseEther('25'),
})

export default func
