import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAUSDC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAUSDC_ADDRESS,
  underlyingSymbol: 'vaUSDC',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('50000'),
})

export default func
