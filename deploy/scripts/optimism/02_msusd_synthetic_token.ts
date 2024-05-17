import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  decimals: 18,
  maxTotalSupply: parseEther('3000000'),
})

export default func
