import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {OP_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: OP_ADDRESS,
  underlyingSymbol: 'OP',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.7'), // 70%
  maxTotalSupply: parseEther('6060606'),
})

export default func
