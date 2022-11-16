import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('40'),
})

export default func
