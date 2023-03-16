import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {ethers, network} from 'hardhat'
import {Pool, DepositToken} from '../../typechain'
import Address from '../../helpers/address'
import {
  impersonateAccount as impersonate,
  setBalance,
  mine,
  setStorageAt,
  time,
} from '@nomicfoundation/hardhat-network-helpers'

const {hexlify, solidityKeccak256, zeroPad, getAddress} = ethers.utils

export const DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS = '0x2465CefD3b488BE410b941b1d4b2767088e2A028'
export const DEFAULT_TWAP_PERIOD = time.duration.hours(2)

/**
 * X (amount to repay)
 * D (current debt)
 * C (colleteral)
 * CF (collateral's collateral factor)
 * LIMIT (mintable limit) = SUM(C * CF)
 * FEE = 1e18 + liquidatorIncentive + protocolLiquidationFee
 * D' (debt after liquidation) = D - X
 * C' (collateral after liquidation) = C - (X * FEE)
 * LIMIT' (mintable limit after liquidation) = LIMIT - (C * CF) + (C' * CF)
 *
 * We want to discover the X value that makes: D' == LIMIT'
 * => D' == LIMIT'
 * => D - X = LIMIT - (C * CF) + (C' * CF)
 * => D - X = LIMIT - (C * CF) + ([C - (X * FEE)] * CF)
 * => D - X = LIMIT - C*CF + C*CF - (X * FEE)*CF
 * => D - X = LIMIT - X * FEE * CF
 * => D - X - LIMIT = -1 * X * FEE * CF
 * => D/X - LIMIT/X = (-1 * FEE * CF) + 1
 * => (D - LIMIT)/X = (-1 * FEE * CF) + 1
 * => (D - LIMIT)/[(-1 * FEE * CF) + 1] = X
 */
export const getMinLiquidationAmountInUsd = async function (
  pool: Pool,
  accountAddress: string,
  depositToken: DepositToken
): Promise<BigNumber> {
  const {_issuableLimitInUsd, _debtInUsd} = await pool.debtPositionOf(accountAddress)

  const [liquidatorIncentive, protocolFee] = await pool.liquidationFees()
  const fee = parseEther('1').add(liquidatorIncentive).add(protocolFee)
  const cf = await depositToken.collateralFactor()

  const numerator = _debtInUsd.sub(_issuableLimitInUsd)
  const denominator = fee.mul('-1').mul(cf).div(parseEther('1')).add(parseEther('1'))

  return numerator.mul(parseEther('1')).div(denominator)
}

export const increaseTimeOfNextBlock = async (timeToIncrease: number): Promise<void> => {
  const timestamp = (await ethers.provider.getBlock('latest')).timestamp + timeToIncrease
  await time.setNextBlockTimestamp(timestamp)
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
      [Address.FRAX_ADDRESS]: 0,
      [Address.USDT_ADDRESS]: 2,
      [Address.VAFRAX_ADDRESS]: 0,
      [Address.VAUSDC_ADDRESS]: 0,
      [Address.VAETH_ADDRESS]: 0,
      [Address.VASTETH_ADDRESS]: 0,
      [Address.VARETH_ADDRESS]: 0,
      [Address.WBTC_ADDRESS]: 0,
      [Address.SFRXETH_ADDRESS]: 3,
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
  await setStorageAt(token, index, value)
  await mine()
}

export const impersonateAccount = async (address: string): Promise<SignerWithAddress> => {
  await impersonate(address)
  await setBalance(address, parseEther('1000000'))
  return await ethers.getSigner(address)
}
