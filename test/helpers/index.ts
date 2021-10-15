import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {ethers, network} from 'hardhat'
import {MBox, SyntheticAsset} from '../../typechain'

export const HOUR = BigNumber.from(60 * 60)
export const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const MET_ADDRESS = '0xa3d58c4e56fedcae3a7c43a725aee9a71f0ece4e'
export const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
export const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
export const WBTC_ADDRESS = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'
export const UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS = '0x0F1f5A87f99f0918e6C81F16E59F3518698221Ff'
export const UNISWAP_V2_ROUTER02_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
export const CHAINLINK_ETH_AGGREGATOR_ADDRESS = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419'
export const CHAINLINK_BTC_AGGREGATOR_ADDRESS = '0xf4030086522a5beea4988f8ca5b36dbc97bee88c'
export const CHAINLINK_DOGE_AGGREGATOR_ADDRESS = '0x2465cefd3b488be410b941b1d4b2767088e2a028'
export const DEFAULT_TWAP_PERIOD = HOUR.mul('2')

/**
 * sCR = synthetic's collateralization ratio
 * D = debt with collateralization value in USD
 * C = collateral value in USD
 * L = liquidation fee
 * Calculates USD value needed = (C - D)/(L - sCR - 1)
 * Note: This should be used when collateral:debit >= 1
 */
export const getMinLiquidationAmountInUsd = async function (
  mBOX: MBox,
  accountAddress: string,
  mAsset: SyntheticAsset
): Promise<BigNumber> {
  const {_lockedDepositInUsd, _depositInUsd} = await mBOX.debtPositionOf(accountAddress)
  const mAssetCR = await mAsset.collateralizationRatio()
  const fee = (await mBOX.liquidatorFee()).add(await mBOX.liquidateFee())

  const numerator = _depositInUsd.sub(_lockedDepositInUsd)
  const denominator = fee.sub(mAssetCR.sub(parseEther('1')))

  return numerator.mul(parseEther('1')).div(denominator)
}

/**
 * C = collateral value in USD
 * L = liquidation fee
 * Calculates USD value needed = C/(1 + L)
 */
export const getMaxLiquidationAmountInUsd = async function (mBOX: MBox, accountAddress: string): Promise<BigNumber> {
  const {_depositInUsd} = await mBOX.debtPositionOf(accountAddress)
  const fee = (await mBOX.liquidatorFee()).add(await mBOX.liquidateFee())

  const numerator = _depositInUsd
  const denominator = parseEther('1').add(fee)

  return numerator.mul(parseEther('1')).div(denominator)
}

export const increaseTime = async (timeToIncrease: BigNumber): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [timeToIncrease.toNumber()])
  await ethers.provider.send('evm_mine', [])
}

export const enableForking = async (): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.NODE_URL,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          blockNumber: parseInt(process.env.BLOCK_NUMBER!),
        },
      },
    ],
  })
}

export const disableForking = async (): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [],
  })
}
