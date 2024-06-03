import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther, parseUnits} from 'ethers/lib/utils'

const {WBTC_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: WBTC_ADDRESS,
  underlyingSymbol: 'WBTC',
  underlyingDecimals: 8,
  collateralFactor: parseEther('0.7'), // 70%
  maxTotalSupply: parseUnits('6', 8),
})

export default func
