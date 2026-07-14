import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  maxTotalSupply: parseEther('6000000'),
})

export default func
