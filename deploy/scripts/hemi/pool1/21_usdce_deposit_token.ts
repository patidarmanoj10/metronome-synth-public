import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther, parseUnits} from 'ethers/lib/utils'

const {USDCe_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: USDCe_ADDRESS,
  underlyingSymbol: 'USDCe',
  underlyingDecimals: 6,
  collateralFactor: parseEther('0.85'),
  maxTotalSupply: parseUnits('2000000', 6),
})

export default func
