import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAFRAX_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAFRAX_ADDRESS,
  underlyingSymbol: 'vaFRAX',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.6'), // 60%
  maxTotalSupply: parseEther('100000'),
})

export default func
