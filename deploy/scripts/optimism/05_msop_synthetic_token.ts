import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth OP',
  symbol: 'msOP',
  maxTotalSupply: parseEther('360000'),
})

export default func
