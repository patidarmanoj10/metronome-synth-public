import {buildDepositDeployFunction} from '../helpers'
import Address from '../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {MET_ADDRESS: underlyingAddress} = Address

const func = buildDepositDeployFunction({
  underlyingAddress,
  underlyingSymbol: 'MET',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.67'), // 67%
  oracle: {function: 'addOrUpdateAssetThatUsesUniswapV3', args: [underlyingAddress]},
})

export default func
