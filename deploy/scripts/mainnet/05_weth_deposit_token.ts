import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.7'), // 70%
  maxTotalSupply: parseEther('80'),
})

export default func
