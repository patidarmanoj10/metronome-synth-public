import {parseEther} from 'ethers/lib/utils'
import {buildSyntheticDeployFunction} from '../helpers'
import Address from '../../helpers/address'

const {NATIVE_TOKEN_ADDRESS} = Address
const STALE_PERIOD = 60 * 15 // 15 minutes

const func = buildSyntheticDeployFunction({
  name: 'Vesper Synth ETH',
  symbol: 'vsETH',
  decimals: 18,
  interestRate: parseEther('0'), // 0%
  oracle: {function: 'addOrUpdateAssetThatUsesUniswapV2', args: [NATIVE_TOKEN_ADDRESS, STALE_PERIOD]},
  salt: '0x01',
})

export default func
