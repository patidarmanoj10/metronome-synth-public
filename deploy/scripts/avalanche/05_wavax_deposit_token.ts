import {buildDepositTokenDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WAVAX_ADDRESS} = Address

const func = buildDepositTokenDeployFunction({
  underlyingAddress: WAVAX_ADDRESS,
  underlyingSymbol: 'WAVAX',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('5880'),
})

export default func
