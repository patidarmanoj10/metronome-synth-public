import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: USDC_ADDRESS,
  underlyingSymbol: 'USDC',
  underlyingDecimals: 6,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('50000'),
})

export default func
