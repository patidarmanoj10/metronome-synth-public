/* eslint-disable max-len */
/* eslint-disable camelcase */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { toUSD, parseEther, parseUnits } from '../helpers'
import {disableForking, enableForking} from './helpers'
import { impersonateAccount, setTokenBalance } from './helpers/index'
import Address from '../helpers/address'
import {
  DepositToken,
  SyntheticToken,
  Pool,
  ERC20,
  DebtToken,
} from '../typechain'

const { MaxUint256 } = ethers.constants
const dust = toUSD('20')

async function fixture() {
  const usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS)
  const poolRegistry = await ethers.getContractAt('PoolRegistry', Address.POOL_REGISTRY_ADDRESS)
  const pool = await ethers.getContractAt('Pool', Address.POOL_ADDRESS)
  const governor = await impersonateAccount(await pool.governor())
  const msdUSDC = await ethers.getContractAt('DepositToken', Address.USDC_DEPOSIT_ADDRESS) // 6 decimals.
  const msUSD = await ethers.getContractAt('SyntheticToken', Address.MSUSD_SYNTHETIC_ADDRESS)
  const msUSDDebt = await ethers.getContractAt('DebtToken', Address.MSUSD_DEBT_ADDRESS)
  const msETH = await ethers.getContractAt('SyntheticToken', Address.MSETH_SYNTHETIC_ADDRESS)
  await poolRegistry.connect(governor).registerPool(pool.address)

  return {
    usdc,
    pool,
    msUSD,
    msdUSDC,
    msUSDDebt,
    msETH,
  }
}

describe('Integration tests', function () {
  let alice: SignerWithAddress
  let usdc: ERC20
  let pool: Pool
  let msUSD: SyntheticToken
  let msdUSDC: DepositToken
  let msUSDDebt: DebtToken
  let msETH: SyntheticToken
  
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice] = await ethers.getSigners()
      ; ({
        usdc,
        pool,
        msUSD,
        msdUSDC,
        msUSDDebt,
        msETH,
      } = await loadFixture(fixture))
    await setTokenBalance(usdc.address, alice.address, parseEther('10'))
    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
  })

  describe('synth mainnet end to end sanity tests', function () {
    it('should deposit', async function () {
      // given
      const amount = parseUnits('1', await usdc.decimals())

      // when
      await msdUSDC.connect(alice).deposit(amount, alice.address)

      // then
      expect((await pool.depositOf(alice.address))._depositInUsd).eq(toUSD('1'))
    })

    it('should issue', async function () {
      // when
      await msdUSDC.connect(alice).deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(alice).issue(parseEther('1'), alice.address)

      // then
      expect(await pool.debtOf(alice.address)).eq(toUSD('1'))
    })

    it('should swap', async function () {
      // given
      await msdUSDC.connect(alice).deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(alice).issue(parseEther('1'), alice.address)
      const debtsBefore = await Promise.all([
        await pool.debtOf(alice.address),
      ])

      // when          
      await pool.connect(alice).swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))
      expect(await msUSD.balanceOf(alice.address)).eq(0)
      expect(await msETH.balanceOf(alice.address)).eq('766147679975335') // 1 msUSD to msETH

      // then
      const debtsAfter = await Promise.all([
        await pool.debtOf(alice.address),
      ])
      expect(debtsAfter).deep.eq(debtsBefore)
    })

    it('should repay', async function () {
      // given
      await msdUSDC.connect(alice).deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(alice).issue(parseEther('1'), alice.address)
      const msUSDDebtBalance = await msUSDDebt.balanceOf(alice.address)
      expect(await pool.debtOf(alice.address)).eq(toUSD('1'))
      expect(msUSDDebtBalance).eq(toUSD('1'))
      const repayFee = await pool.repayFee()

      // when
      const debtToRepay = parseEther('0.5')
      const debtPlusRepayFee = debtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
      await msUSDDebt.connect(alice).repay(alice.address, debtPlusRepayFee)

      // then
      expect(await msUSDDebt.balanceOf(alice.address)).lt(msUSDDebtBalance)
    })

    it('should revert if repaying using wrong synthetic asset', async function () {
      // given
      await msdUSDC.connect(alice).deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(alice).issue(parseEther('1'), alice.address)
      expect(await pool.debtOf(alice.address)).eq(toUSD('1'))
      expect(await msUSD.balanceOf(alice.address)).closeTo(parseEther('1'), dust)
      await pool.connect(alice).swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // when
      const tx = msUSDDebt.connect(alice).repay(alice.address, 10) // pay 10 wei

      // then
      await expect(tx).rejectedWith('burn-amount-exceeds-balance')
    })

    it('should withdraw', async function () {
      await msdUSDC.connect(alice).deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(alice).issue(parseEther('1'), alice.address)

      // when
      const amount = await msdUSDC.unlockedBalanceOf(alice.address)
      await msdUSDC.connect(alice).withdraw(amount, alice.address)

      // then
      const { _depositInUsd: depositAfter } = await pool.depositOf(alice.address)
      expect(depositAfter).closeTo(0, dust)
    })
  })
})
