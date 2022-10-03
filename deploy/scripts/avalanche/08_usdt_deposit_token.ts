import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDT_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: USDT_ADDRESS,
  underlyingSymbol: 'USDT',
  underlyingDecimals: 6,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('100000'),
})

export default func
