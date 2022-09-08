import {buildDepositDeployFunction} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'
import {toUSD} from '../../../helpers'

const {DAI_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: DAI_ADDRESS,
  underlyingSymbol: 'DAI',
  underlyingDecimals: 18,
  collateralizationRatio: parseEther('0.5'), // 50%
  maxTotalSupplyInUsd: toUSD('100000'),
})

export default func
