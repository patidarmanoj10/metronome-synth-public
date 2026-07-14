import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  maxTotalSupply: parseEther('500000'),
})

export default func
