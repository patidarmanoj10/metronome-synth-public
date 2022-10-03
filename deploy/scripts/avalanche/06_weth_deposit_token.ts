import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WETH_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupply: parseEther('77'),
})

export default func
