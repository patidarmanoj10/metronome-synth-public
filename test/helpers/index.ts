import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {ethers, network} from 'hardhat'
import {Controller, DepositToken} from '../../typechain'

export const HOUR = BigNumber.from(60 * 60)
export const CHAINLINK_ETH_AGGREGATOR_ADDRESS = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419'
export const CHAINLINK_BTC_AGGREGATOR_ADDRESS = '0xf4030086522a5beea4988f8ca5b36dbc97bee88c'
export const CHAINLINK_DOGE_AGGREGATOR_ADDRESS = '0x2465cefd3b488be410b941b1d4b2767088e2a028'
export const DEFAULT_TWAP_PERIOD = HOUR.mul('2')
export const BLOCKS_PER_YEAR = 2102400

/**
 * X (amount to repay)
 * D (current debt)
 * C (colleteral)
 * CR (collateral's collateralization ratio)
 * LIMIT (mintable limit) = SUM(C * CR)
 * FEE = 1e18 + liquidatorFee + liquidateFee
 * D' (debt after liquidation) = D - X
 * C' (collateral after liquidation) = C - (X * FEE)
 * LIMIT' (mintable limit after liquidation) = LIMIT - (C * CR) + (C' * CR)
 *
 * We want to discover the X value that makes: D' == LIMIT'
 * => D' == LIMIT'
 * => D - X = LIMIT - (C * CR) + (C' * CR)
 * => D - X = LIMIT - (C * CR) + ([C - (X * FEE)] * CR)
 * => D - X = LIMIT - C*CR + C*CR - (X * FEE)*CR
 * => D - X = LIMIT - X * FEE * CR
 * => D - X - LIMIT = -1 * X * FEE * CR
 * => D/X - LIMIT/X = (-1 * FEE * CR) + 1
 * => (D - LIMIT)/X = (-1 * FEE * CR) + 1
 * => (D - LIMIT)/[(-1 * FEE * CR) + 1] = X
 */
export const getMinLiquidationAmountInUsd = async function (
  controller: Controller,
  accountAddress: string,
  depositToken: DepositToken
): Promise<BigNumber> {
  const {_mintableLimitInUsd, _debtInUsd} = await controller.debtPositionOf(accountAddress)
  const fee = parseEther('1')
    .add(await controller.liquidatorFee())
    .add(await controller.liquidateFee())
  const cr = await depositToken.collateralizationRatio()

  const numerator = _debtInUsd.sub(_mintableLimitInUsd)
  const denominator = fee.mul('-1').mul(cr).div(parseEther('1')).add(parseEther('1'))

  return numerator.mul(parseEther('1')).div(denominator)
}

/**
 * C = collateral value in USD
 * L = liquidation fee
 * Calculates USD value needed = C/(1 + L)
 */
export const getMaxLiquidationAmountInUsd = async function (
  controller: Controller,
  accountAddress: string
): Promise<BigNumber> {
  const {_depositInUsd} = await controller.debtPositionOf(accountAddress)
  const fee = (await controller.liquidatorFee()).add(await controller.liquidateFee())

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

export const setEtherBalance = async (address: string, value: BigNumber): Promise<void> => {
  await network.provider.request({
    method: 'hardhat_setBalance',
    params: [address, ethers.utils.hexStripZeros(value.toHexString())],
  })
}
