import {buildDepositDeployFunction} from '../helpers'
import Address from '../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {DAI_ADDRESS: underlyingAddress} = Address

const func = buildDepositDeployFunction({
  underlyingAddress,
  underlyingSymbol: 'DAI',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.67'), // 67%
  oracle: {function: 'addOrUpdateAssetThatUsesUniswapV3', args: [underlyingAddress]},
  salt: '0x02',
})

export default func
