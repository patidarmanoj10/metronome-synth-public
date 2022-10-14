import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth ETH',
  symbol: 'msETH',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupply: parseEther('40'),
})

export default func
