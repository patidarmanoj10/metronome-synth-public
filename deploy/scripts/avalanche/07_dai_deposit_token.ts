import {buildDepositTokenDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {DAI_ADDRESS} = Address

const func = buildDepositTokenDeployFunction({
  underlyingAddress: DAI_ADDRESS,
  underlyingSymbol: 'DAI',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('100000'),
})

export default func
