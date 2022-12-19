/* eslint-disable new-cap */
/* eslint-disable max-len */
/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
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
  IWETH,
  IWETH__factory,
  NativeTokenGateway,
  PoolRegistry,
  NativeTokenGateway__factory,
} from '../typechain'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/mainnet/PoolRegistry.json'
import {address as USDC_DEPOSIT_ADDRESS} from '../deployments/mainnet/USDCDepositToken.json'
import {address as WETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/WETHDepositToken.json'
import {address as VAWBTC_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaWBTCDepositToken.json'
import {address as VAETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaETHDepositToken.json'
import {address as MSUSD_DEBT_ADDRESS} from '../deployments/mainnet/MsUSDDebt.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/mainnet/MsETHDebt.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsUSDSynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsETHSynthetic.json'
import {address as NATIVE_TOKEN_GATEWAY_ADDRESS} from '../deployments/mainnet/NativeTokenGateway.json'

const {MaxUint256} = ethers.constants
const dust = toUSD('20')

describe('E2E tests', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let usdc: ERC20
  let weth: IWETH
  let vaWBTC: ERC20
  let vaETH: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let pool: Pool
  let msdUSDC: DepositToken
  let msdWETH: DepositToken
  let msdVaWBTC: DepositToken
  let msdVaETH: DepositToken
  let msUSDDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msETH: SyntheticToken

  before(enableForking)

  after(disableForking)

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = ERC20__factory.connect(Address.USDC_ADDRESS, alice)
    weth = IWETH__factory.connect(Address.WETH_ADDRESS, alice)
    vaWBTC = ERC20__factory.connect(Address.VAWBTC_ADDRESS, alice)
    vaETH = ERC20__factory.connect(Address.VAETH_ADDRESS, alice)

    poolRegistry = PoolRegistry__factory.connect(POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = NativeTokenGateway__factory.connect(NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = Pool__factory.connect(pool1Address, alice)

    msdUSDC = DepositToken__factory.connect(USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdWETH = DepositToken__factory.connect(WETH_DEPOSIT_ADDRESS, alice)
    msdVaWBTC = DepositToken__factory.connect(VAWBTC_DEPOSIT_ADDRESS, alice)
    msdVaETH = DepositToken__factory.connect(VAETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = DebtToken__factory.connect(MSUSD_DEBT_ADDRESS, alice)
    msETHDebt = DebtToken__factory.connect(MSETH_DEBT_ADDRESS, alice)

    msUSD = SyntheticToken__factory.connect(MSUSD_SYNTHETIC_ADDRESS, alice)
    msETH = SyntheticToken__factory.connect(MSETH_SYNTHETIC_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaWBTC.address, alice.address, parseUnits('10', 8))
    await setTokenBalance(vaETH.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaWBTC.connect(alice).approve(msdVaWBTC.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH.address, MaxUint256)

    const masterOracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
    masterOracle = new ethers.Contract(
      Address.MASTER_ORACLE_ADDRESS,
      ['function defaultOracle() view returns(address)', 'function getPriceInUsd(address) view returns(uint256)'],
      masterOracleGovernor
    )
    const defaultOracle = new ethers.Contract(
      await masterOracle.defaultOracle(),
      ['function updateDefaultStalePeriod(uint256)'],
      masterOracleGovernor
    )
    await defaultOracle.updateDefaultStalePeriod(ethers.constants.MaxUint256)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool.poolRegistry())
      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(VAETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaETH.address))
      expect(VAWBTC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaWBTC.address))
      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaWBTC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msETH.address)).gt(0)
    })
  })

  describe('synth mainnet end to end sanity tests', function () {
    it('should deposit USDC', async function () {
      // given
      const amount = parseUnits('1', 6)

      // when
      const tx = () => msdUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDC, alice, amount)
    })

    it('should deposit WETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdWETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWETH, alice, amount)
    })

    it('should deposit WETH using ETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => nativeGateway.deposit(pool.address, {value: amount})

      // then
      await expect(tx).changeTokenBalance(msdWETH, alice, amount)
    })

    it('should deposit vaWBTC', async function () {
      // given
      const amount = parseUnits('1', 8)

      // when
      const tx = () => msdVaWBTC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaWBTC, alice, amount)
    })

    it('should deposit vaETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaETH, alice, amount)
    })

    it('should issue msUSD', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 6)
      const tx = () => msUSDDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msUSD, alice, amount)
    })

    it('should issue msETH', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10,000', await usdc.decimals()), alice.address)

      // when
      const amount = parseEther('1')
      const tx = () => msETHDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msETH, alice, amount)
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
      expect(await pool.debtOf(alice.address)).closeTo(parseEther('102'), parseEther('0.01'))
    })

    it('should liquidate unhealthy position', async function () {
      // given
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), alice.address)
      const {_issuableInUsd} = await pool.debtPositionOf(alice.address)
      await msUSDDebt.issue(_issuableInUsd, alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0.1')) // 10%
      await time.increase(time.duration.hours(2))
      await msUSDDebt.accrueInterest()
      expect((await pool.debtPositionOf(alice.address))._isHealthy).false

      // when
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), bob.address)
      await msUSDDebt.connect(bob).issue(parseEther('100'), bob.address)
      const amountToRepay = parseEther('50') // repay all user's debt
      const tx = await pool.connect(bob).liquidate(msUSD.address, alice.address, amountToRepay, msdUSDC.address)

      // // then
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
      await expect(tx).revertedWithCustomError(msUSDDebt, 'BurnAmountExceedsBalance')
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
