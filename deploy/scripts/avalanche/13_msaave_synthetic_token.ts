import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth AAVE',
  symbol: 'msAAVE',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupply: parseEther('6600'),
})

export default func
