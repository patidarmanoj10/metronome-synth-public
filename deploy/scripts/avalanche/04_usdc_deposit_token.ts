import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: USDC_ADDRESS,
  underlyingSymbol: 'USDC',
  underlyingDecimals: 6,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('100000'),
})

export default func
