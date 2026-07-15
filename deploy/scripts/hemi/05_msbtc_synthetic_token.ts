import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth BTC',
  symbol: 'msBTC',
  maxTotalSupply: parseEther('105'),
})

export default func
