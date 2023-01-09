import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VASTETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VASTETH_ADDRESS,
  underlyingSymbol: 'vaSTETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.6'), // 60%
  maxTotalSupply: parseEther('80'),
})

export default func
