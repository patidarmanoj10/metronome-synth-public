import {buildDepositTokenDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDT_ADDRESS} = Address

const func = buildDepositTokenDeployFunction({
  underlyingAddress: USDT_ADDRESS,
  underlyingSymbol: 'USDT',
  underlyingDecimals: 6,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('100000'),
})

export default func
