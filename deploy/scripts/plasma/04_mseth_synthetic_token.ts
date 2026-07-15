import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticTokenDeployFunction} from '../../helpers'

const func = buildSyntheticTokenDeployFunction({
  name: 'Metronome Synth ETH',
  symbol: 'msETH',
  maxTotalSupply: parseEther('5000'),
})

export default func
