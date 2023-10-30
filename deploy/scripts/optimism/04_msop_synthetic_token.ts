import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth OP',
  symbol: 'msOP',
  decimals: 18,
  maxTotalSupply: parseEther('360000'),
})

export default func
