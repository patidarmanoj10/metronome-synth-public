import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAUSDC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAUSDC_ADDRESS,
  underlyingSymbol: 'vaUSDC',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.82'), // 82%
  maxTotalSupply: parseEther('10000000'),
})

export default func
