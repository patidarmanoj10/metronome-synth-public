import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {VAETH_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: VAETH_ADDRESS,
  underlyingSymbol: 'vaETH',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.6'), // 60%
  maxTotalSupply: parseEther('80'),
})

export default func
