import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAFRAX_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: VAFRAX_ADDRESS,
  underlyingSymbol: 'vaFRAX',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('50000'),
})

export default func
