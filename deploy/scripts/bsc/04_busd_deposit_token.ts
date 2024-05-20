import {buildDepositTokenDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {BUSD_ADDRESS} = Address

const func = buildDepositTokenDeployFunction({
  underlyingAddress: BUSD_ADDRESS,
  underlyingSymbol: 'BUSD',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('50000'),
})

export default func
