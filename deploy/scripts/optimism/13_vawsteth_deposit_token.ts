import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAWSTETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAWSTETH_ADDRESS,
  underlyingSymbol: 'vaWSTETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.78'), // 78%
  maxTotalSupply: parseEther('2857'),
})

export default func
