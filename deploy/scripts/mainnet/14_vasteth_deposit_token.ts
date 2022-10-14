import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VASTETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VASTETH_ADDRESS,
  underlyingSymbol: 'vaSTETH',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('40'),
})

export default func
