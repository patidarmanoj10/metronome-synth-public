import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WAVAX_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WAVAX_ADDRESS,
  underlyingSymbol: 'WAVAX',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('5880'),
})

export default func
