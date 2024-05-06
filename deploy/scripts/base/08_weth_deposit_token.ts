import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.83'), // 83%
  maxTotalSupply: parseEther('4285'),
})

export default func
