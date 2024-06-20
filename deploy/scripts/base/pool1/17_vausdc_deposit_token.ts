import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAUSDC_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: VAUSDC_ADDRESS,
  underlyingSymbol: 'vaUSDC',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.82'), // 82%
  maxTotalSupply: parseEther('500000'),
})

export default func
