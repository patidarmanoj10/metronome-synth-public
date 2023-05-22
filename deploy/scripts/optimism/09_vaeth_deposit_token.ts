import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAETH_ADDRESS,
  underlyingSymbol: 'vaETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.8'), // 80%
  maxTotalSupply: parseEther('4170'),
})

export default func
