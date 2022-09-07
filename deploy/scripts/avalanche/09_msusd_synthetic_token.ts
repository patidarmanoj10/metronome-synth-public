import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../../helpers'
import {buildSyntheticDeployFunction} from '../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupplyInUsd: toUSD('50000'),
})

export default func
