import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../helpers'
import Address from '../../helpers/address'

const {NATIVE_TOKEN_ADDRESS} = Address

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth ETH',
  symbol: 'vsETH',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  oracle: {function: 'addOrUpdateAssetThatUsesUniswapV3', args: [NATIVE_TOKEN_ADDRESS]},
  salt: '0x01',
})

export default func
