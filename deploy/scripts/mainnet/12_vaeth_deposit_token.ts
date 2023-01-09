import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAETH_ADDRESS,
  underlyingSymbol: 'vaETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.6'), // 60%
  maxTotalSupply: parseEther('80'),
})

export default func
