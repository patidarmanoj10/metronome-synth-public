import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth ETH',
  symbol: 'msETH',
  decimals: 18,
  maxTotalSupply: parseEther('2000'),
})

export default func
