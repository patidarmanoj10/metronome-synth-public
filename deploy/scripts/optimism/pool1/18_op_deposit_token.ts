import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {OP_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: OP_ADDRESS,
  underlyingSymbol: 'OP',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.7'), // 70%
  maxTotalSupply: parseEther('6060606'),
})

export default func
