import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VADAI_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VADAI_ADDRESS,
  underlyingSymbol: 'vaDAI',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.6'), // 60%
  maxTotalSupply: parseEther('100000'),
})

export default func
