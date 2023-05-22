import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth OP',
  symbol: 'msOP',
  decimals: 18,
  interestRate: parseEther('0.01'), // 1%
  maxTotalSupply: parseEther('1250'),
})

export default func
