import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VASTETH_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: VASTETH_ADDRESS,
  underlyingSymbol: 'vaSTETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.78'), // 78%
  maxTotalSupply: parseEther('60'),
})

export default func
