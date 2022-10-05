import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAETH_ADDRESS,
  underlyingSymbol: 'vaETH',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('40'),
})

export default func
