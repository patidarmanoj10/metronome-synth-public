/* eslint-disable new-cap */
/* eslint-disable max-len */
/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {disableForking, enableForking} from './helpers'
import {impersonateAccount, setTokenBalance} from './helpers/index'
import Address from '../helpers/address'
import {
  DepositToken,
  SyntheticToken,
  Pool,
  ERC20,
  DebtToken,
  DepositToken__factory,
  SyntheticToken__factory,
  DebtToken__factory,
  Pool__factory,
  PoolRegistry__factory,
  ERC20__factory,
  PoolRegistry,
} from '../typechain'
const {MaxUint256} = ethers.constants

const dust = toUSD('20')

async function fixture() {
  const [, alice, bob] = await ethers.getSigners()
  const usdc = ERC20__factory.connect(Address.USDC_ADDRESS, alice)
  const poolRegistry = PoolRegistry__factory.connect(Address.POOL_REGISTRY_ADDRESS, alice)
  const pool = Pool__factory.connect(Address.POOL_ADDRESS, alice)
  const msdUSDC = DepositToken__factory.connect(Address.USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
  const msUSD = SyntheticToken__factory.connect(Address.MSUSD_SYNTHETIC_ADDRESS, alice)
  const msUSDDebt = DebtToken__factory.connect(Address.MSUSD_DEBT_ADDRESS, alice)
  const msETH = SyntheticToken__factory.connect(Address.MSETH_SYNTHETIC_ADDRESS, alice)
  const governor = await impersonateAccount(await pool.governor())
  await poolRegistry.connect(governor).registerPool(pool.address)

  await setTokenBalance(usdc.address, alice.address, parseEther('10'))
  await setTokenBalance(usdc.address, bob.address, parseEther('10'))

  await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
  await usdc.connect(bob).approve(msdUSDC.address, MaxUint256)

  const masterOracle = new ethers.Contract(
    Address.MASTER_ORACLE_ADDRESS,
    ['function defaultOracle() view returns(address)'],
    governor
  )

  const defaultOracle = new ethers.Contract(
    await masterOracle.defaultOracle(),
    ['function updateStalePeriod(uint256)'],
    governor
  )

  await defaultOracle.updateStalePeriod(ethers.constants.MaxUint256)

  return {
    governor,
    usdc,
    pool,
    msUSD,
    msdUSDC,
    msUSDDebt,
    msETH,
  }
}

describe('Integration tests', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
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
    ;[, alice, bob] = await ethers.getSigners()
    ;({governor, usdc, pool, msUSD, msdUSDC, msUSDDebt, msETH} = await loadFixture(fixture))
  })

  describe('synth mainnet end to end sanity tests', function () {
    it('should deposit', async function () {
      // given
      const amount = parseUnits('1', await usdc.decimals())

      // when
      await msdUSDC.deposit(amount, alice.address)

      // then
      expect((await pool.depositOf(alice.address))._depositInUsd).closeTo(toUSD('1'), toUSD('0.001'))
    })

    it('should issue', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      await msUSDDebt.issue(parseEther('1'), alice.address)

      // then
      expect(await pool.debtOf(alice.address)).eq(toUSD('1'))
    })

    it('should increase debt by the time', async function () {
      // given
      await msdUSDC.deposit(parseUnits('500', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('100'), alice.address)

      // when
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0.02')) // 2%
      await time.increase(time.duration.years(1))
      await msUSDDebt.accrueInterest()

      // then
      expect(await pool.debtOf(alice.address)).closeTo(parseEther('102'), parseEther('0.0001'))
    })

    it('should liquidate unhealthy position', async function () {
      // given
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0.1')) // 10%
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('200'), alice.address)
      await time.increase(time.duration.hours(10))
      await msUSDDebt.accrueInterest()

      // when
      expect((await pool.debtPositionOf(alice.address))._isHealthy).false
      await msdUSDC.connect(bob).deposit(parseUnits('400', await usdc.decimals()), bob.address)
      await msUSDDebt.connect(bob).issue(parseEther('100'), bob.address)
      const amountToRepay = parseEther('50') // repay all user's debt
      const tx = await pool.connect(bob).liquidate(msUSD.address, alice.address, amountToRepay, msdUSDC.address)

      // then
      await expect(tx).emit(pool, 'PositionLiquidated')
      expect((await pool.debtPositionOf(alice.address))._isHealthy).true
    })

    it('should swap', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)
      const debtBefore = await pool.debtOf(alice.address)
      expect(await msUSD.balanceOf(alice.address)).gt(0)
      expect(await msETH.balanceOf(alice.address)).eq(0)

      // when
      await pool.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // then
      expect(await msUSD.balanceOf(alice.address)).eq(0)
      expect(await msETH.balanceOf(alice.address)).gt(0)
      const debtsAfter = await pool.debtOf(alice.address)
      expect(debtsAfter).eq(debtBefore)
    })

    it('should repay', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)
      const msUSDDebtBalance = await msUSDDebt.balanceOf(alice.address)
      expect(await pool.debtOf(alice.address)).eq(toUSD('1'))
      expect(msUSDDebtBalance).eq(toUSD('1'))

      // when
      const debtToRepay = parseEther('0.5')
      const debtPlusRepayFee = debtToRepay.mul(parseEther('1').add(await pool.repayFee())).div(parseEther('1'))
      await msUSDDebt.repay(alice.address, debtPlusRepayFee)

      // then
      expect(await msUSDDebt.balanceOf(alice.address)).lt(msUSDDebtBalance)
    })

    it('should revert if repaying using wrong synthetic asset', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)
      expect(await pool.debtOf(alice.address)).eq(toUSD('1'))
      expect(await msUSD.balanceOf(alice.address)).closeTo(parseEther('1'), dust)
      await pool.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // when
      const tx = msUSDDebt.repay(alice.address, 10) // pay 10 wei

      // then
      await expect(tx).rejectedWith('burn-amount-exceeds-balance')
    })

    it('should withdraw', async function () {
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)

      // when
      const amount = await msdUSDC.unlockedBalanceOf(alice.address)
      await msdUSDC.withdraw(amount, alice.address)

      // then
      const {_depositInUsd: depositAfter} = await pool.depositOf(alice.address)
      expect(depositAfter).closeTo(0, dust)
    })
  })
})
