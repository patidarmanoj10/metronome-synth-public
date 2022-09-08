import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../../helpers'

const {WAVAX_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: WAVAX_ADDRESS,
  underlyingSymbol: 'WAVAX',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupplyInUsd: toUSD('100000'),
})

export default func
