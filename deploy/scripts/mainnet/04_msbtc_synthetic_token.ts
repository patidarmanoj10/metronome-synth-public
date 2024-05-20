import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth BTC',
  symbol: 'msBTC',
  decimals: 18,
  maxTotalSupply: parseEther('16'),
})

export default func
