import {BigNumber} from '@ethersproject/bignumber'
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {ethers, network} from 'hardhat'
import {Pool, DepositToken} from '../../typechain'
import Address from '../../helpers/address'

const {hexlify, solidityKeccak256, zeroPad, getAddress} = ethers.utils

export const HOUR = BigNumber.from(60 * 60)
export const DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS = '0x2465CefD3b488BE410b941b1d4b2767088e2A028'
export const DEFAULT_TWAP_PERIOD = HOUR.mul('2')

/**
 * X (amount to repay)
 * D (current debt)
 * C (colleteral)
 * CR (collateral's collateralization ratio)
 * LIMIT (mintable limit) = SUM(C * CR)
 * FEE = 1e18 + liquidatorLiquidationFee + protocolLiquidationFee
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
  pool: Pool,
  accountAddress: string,
  depositToken: DepositToken
): Promise<BigNumber> {
  const {_issuableLimitInUsd, _debtInUsd} = await pool.debtPositionOf(accountAddress)

  const [liquidatorFee, protocolFee] = await pool.liquidationFees()
  const fee = parseEther('1').add(liquidatorFee).add(protocolFee)
  const cr = await depositToken.collateralizationRatio()

  const numerator = _debtInUsd.sub(_issuableLimitInUsd)
  const denominator = fee.mul('-1').mul(cr).div(parseEther('1')).add(parseEther('1'))

  return numerator.mul(parseEther('1')).div(denominator)
}

/**
 * C = collateral value in USD
 * L = liquidation fee
 * Calculates USD value needed = C/(1 + L)
 */
export const getMaxLiquidationAmountInUsd = async function (pool: Pool, accountAddress: string): Promise<BigNumber> {
  const {_depositInUsd} = await pool.debtPositionOf(accountAddress)
  const [liquidatorFee, protocolFee] = await pool.liquidationFees()
  const fee = liquidatorFee.add(protocolFee)

  const numerator = _depositInUsd
  const denominator = parseEther('1').add(fee)

  return numerator.mul(parseEther('1')).div(denominator)
}

export const mineBlock = async (): Promise<void> => {
  await ethers.provider.send('evm_mine', [])
}

// TODO: To number?
export const increaseTime = async (timeToIncrease: BigNumber): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [timeToIncrease.toNumber()])
  await mineBlock()
}

export const increaseTimeOfNextBlock = async (timeToIncrease: number): Promise<void> => {
  const timestamp = (await ethers.provider.getBlock('latest')).timestamp + timeToIncrease
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp])
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

const getBalancesSlot = (token: string) => {
  // Slot number mapping for a token. Prepared using utility https://github.com/kendricktan/slot20
  const slots: {
    [chainId: number]: {
      [key: string]: number
    }
  } = {
    [1]: {
      [Address.WAVAX_ADDRESS]: 5,
      [Address.WETH_ADDRESS]: 3,
      [Address.USDC_ADDRESS]: 9,
      [Address.DAI_ADDRESS]: 2,
      [Address.USDT_ADDRESS]: 2,
    },
    [43114]: {
      [Address.WAVAX_ADDRESS]: 3,
      [Address.WETH_ADDRESS]: 0,
      [Address.USDC_ADDRESS]: 0,
      [Address.DAI_ADDRESS]: 0,
      [Address.USDT_ADDRESS]: 0,
    },
  }

  // only use checksum address
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return slots[network.config.chainId!][getAddress(token)]
}

export const setTokenBalance = async (token: string, targetAddress: string, balance: BigNumber): Promise<void> => {
  const slot = getBalancesSlot(token)
  if (slot === undefined) {
    throw new Error(`Missing slot configuration for token ${token}`)
  }

  // reason: https://github.com/nomiclabs/hardhat/issues/1585 comments
  const index = hexlify(solidityKeccak256(['uint256', 'uint256'], [targetAddress, slot])).replace('0x0', '0x')

  const value = hexlify(zeroPad(balance.toHexString(), 32))

  // Hack the balance by directly setting the EVM storage
  await ethers.provider.send('hardhat_setStorageAt', [token, index, value])
  await ethers.provider.send('evm_mine', [])
}

export const impersonateAccount = async (address: string): Promise<SignerWithAddress> => {
  await network.provider.request({method: 'hardhat_impersonateAccount', params: [address]})
  await network.provider.request({
    method: 'hardhat_setBalance',
    params: [address, ethers.utils.hexStripZeros(parseEther('1000000').toHexString())],
  })
  return await ethers.getSigner(address)
}
