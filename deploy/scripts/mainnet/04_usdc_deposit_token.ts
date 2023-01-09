import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther, parseUnits} from 'ethers/lib/utils'

const {USDC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: USDC_ADDRESS,
  underlyingSymbol: 'USDC',
  underlyingDecimals: 6,
  collateralFactor: parseEther('0.75'), // 75%
  maxTotalSupply: parseUnits('100000', 6),
})

export default func
