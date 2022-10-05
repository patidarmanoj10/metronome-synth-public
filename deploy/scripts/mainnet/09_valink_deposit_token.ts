import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VALINK_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VALINK_ADDRESS,
  underlyingSymbol: 'vaLINK',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('7000'),
})

export default func
