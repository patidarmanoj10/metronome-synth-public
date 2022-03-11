import {buildDepositDeployFunction} from '../helpers'
import Address from '../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDC_ADDRESS, USDC_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

const func = buildDepositDeployFunction({
  underlyingAddress: USDC_ADDRESS,
  underlyingSymbol: 'USDC',
  underlyingDecimals: 6,
  collateralizationRatio: parseEther('0.5'), // 50%
  oracle: {
    function: 'addOrUpdateAssetThatUsesChainlink',
    args: {
      aggregator: USDC_USD_CHAINLINK_AGGREGATOR_ADDRESS,
      stalePeriod: 60 * 60 * 24, // 24h
    },
  },
  salt: '0x01',
})

export default func
