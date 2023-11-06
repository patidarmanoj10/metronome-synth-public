import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther, parseUnits} from 'ethers/lib/utils'

const {USDC_ADDRESS} = Address

const {
  Pool2: {alias: Pool2},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool2,
  underlyingAddress: USDC_ADDRESS,
  underlyingSymbol: 'USDC',
  underlyingDecimals: 6,
  collateralFactor: parseEther('0.75'), // 75%
  maxTotalSupply: parseUnits('10000', 6),
})

export default func
