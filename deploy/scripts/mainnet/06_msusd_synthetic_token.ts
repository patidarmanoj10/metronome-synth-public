import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  decimals: 18,
  interestRate: parseEther('0.01'), // 1%
  maxTotalSupply: parseEther('750000'),
})

export default func
