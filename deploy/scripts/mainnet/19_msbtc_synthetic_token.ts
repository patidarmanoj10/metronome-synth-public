import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth BTC',
  symbol: 'msBTC',
  decimals: 18,
  interestRate: parseEther('0.01'), // 1%
  maxTotalSupply: parseEther('16'),
})

export default func
