import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WBNB_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WBNB_ADDRESS,
  underlyingSymbol: 'WBNB',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('185'),
})

export default func
