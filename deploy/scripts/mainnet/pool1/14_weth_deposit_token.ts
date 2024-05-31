import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {WETH_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: WETH_ADDRESS,
  underlyingSymbol: 'WETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.7'), // 70%
  maxTotalSupply: parseEther('80'),
})

export default func
