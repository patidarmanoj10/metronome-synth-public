import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth DOGE',
  symbol: 'msDOGE',
  decimals: 18,
  interestRate: parseEther('0.01'), // 1%
  maxTotalSupply: parseEther('1500000'),
})

export default func
