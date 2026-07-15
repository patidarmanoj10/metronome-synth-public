import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther, parseUnits} from 'ethers/lib/utils'

const {USDT_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: USDT_ADDRESS,
  underlyingSymbol: 'USDT',
  underlyingDecimals: 6,
  collateralFactor: parseEther('0.85'), // 85%
  maxTotalSupply: parseUnits('10000', 6),
})

export default func
