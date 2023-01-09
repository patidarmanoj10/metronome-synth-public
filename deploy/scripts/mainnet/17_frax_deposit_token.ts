import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {FRAX_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: FRAX_ADDRESS,
  underlyingSymbol: 'FRAX',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.75'), // 75%
  maxTotalSupply: parseEther('100000'),
})

export default func
