import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAWSTETH_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: VAWSTETH_ADDRESS,
  underlyingSymbol: 'vaWSTETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.78'), // 78%
  maxTotalSupply: parseEther('100'),
})

export default func
