import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAWBTC_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAWBTC_ADDRESS,
  underlyingSymbol: 'vaWBTC',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('5'),
})

export default func
