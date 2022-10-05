import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VADAI_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VADAI_ADDRESS,
  underlyingSymbol: 'vaDAI',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('50000'),
})

export default func
