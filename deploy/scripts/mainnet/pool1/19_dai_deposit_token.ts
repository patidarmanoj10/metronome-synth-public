import {buildDepositTokenDeployFunction, UpgradableContracts} from '../../../helpers'
import Address from '../../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {DAI_ADDRESS} = Address

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDepositTokenDeployFunction({
  poolAlias: Pool1,
  underlyingAddress: DAI_ADDRESS,
  underlyingSymbol: 'DAI',
  underlyingDecimals: 18,
  collateralFactor: parseEther('0.75'), // 75%
  maxTotalSupply: parseEther('100000'),
})

export default func
