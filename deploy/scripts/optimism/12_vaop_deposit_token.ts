import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAOP_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAOP_ADDRESS,
  underlyingSymbol: 'vaOP',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.7'), // 70%
  maxTotalSupply: parseEther('6060606'),
})

export default func