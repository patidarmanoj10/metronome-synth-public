import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../../helpers'
import {toUSD} from '../../../helpers'

const func = buildSyntheticDeployFunction({
  name: 'Metronome Synth CRV',
  symbol: 'msCRV',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  maxTotalSupplyInUsd: toUSD('50000'),
})

export default func
