import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAWBTC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAWBTC_ADDRESS,
  underlyingSymbol: 'vaWBTC',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.6'), // 60%
  maxTotalSupply: parseEther('6'),
})

export default func
