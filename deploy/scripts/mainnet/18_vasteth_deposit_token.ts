import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VASTETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VASTETH_ADDRESS,
  underlyingSymbol: 'vaSTETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.78'), // 78%
  maxTotalSupply: parseEther('60'),
})

export default func
