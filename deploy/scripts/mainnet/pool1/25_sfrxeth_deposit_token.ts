import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {SFRXETH_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: SFRXETH_ADDRESS,
  underlyingSymbol: 'sfrxETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.60'), // 60%
  maxTotalSupply: parseEther('3333.33333333333'),
})

export default func
