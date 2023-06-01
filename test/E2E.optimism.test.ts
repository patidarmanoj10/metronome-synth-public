/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
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
  IWETH,
  NativeTokenGateway,
  PoolRegistry,
} from '../typechain'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/optimism/PoolRegistry.json'
import {address as USDC_DEPOSIT_ADDRESS} from '../deployments/optimism/USDCDepositToken.json'
import {address as OP_DEPOSIT_ADDRESS} from '../deployments/optimism/OPDepositToken.json'
import {address as WETH_DEPOSIT_ADDRESS} from '../deployments/optimism/WETHDepositToken.json'
import {address as VAUSDC_DEPOSIT_ADDRESS} from '../deployments/optimism/vaUSDCDepositToken.json'
import {address as VAOP_DEPOSIT_ADDRESS} from '../deployments/optimism/vaOPDepositToken.json'
import {address as VAETH_DEPOSIT_ADDRESS} from '../deployments/optimism/vaETHDepositToken.json'
import {address as VAWSTETH_DEPOSIT_ADDRESS} from '../deployments/optimism/vaWSTETHDepositToken.json'
import {address as MSUSD_DEBT_ADDRESS} from '../deployments/optimism/MsUSDDebt.json'
import {address as MSOP_DEBT_ADDRESS} from '../deployments/optimism/MsOPDebt.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/optimism/MsETHDebt.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/optimism/MsUSDSynthetic.json'
import {address as MSOP_SYNTHETIC_ADDRESS} from '../deployments/optimism/MsOPSynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/optimism/MsETHSynthetic.json'
import {address as NATIVE_TOKEN_GATEWAY_ADDRESS} from '../deployments/optimism/NativeTokenGateway.json'
import {address as REWARD_DISTRIBUTOR_ADDRESS} from '../deployments/optimism/OpRewardsDistributor.json'

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

// Note: Skipping for now because the tests use mainnet by default
describe.skip('E2E tests (optimism)', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let usdc: ERC20
  let op: ERC20
  let weth: IWETH
  let vaUSDC: ERC20
  let vaOP: ERC20
  let vawstETH: ERC20
  let vaETH: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let pool: Pool
  let msdUSDC: DepositToken
  let msdOP: DepositToken
  let msdWETH: DepositToken
  let msdVaUSDC: DepositToken
  let msdVaOP: DepositToken
  let msdVaETH: DepositToken
  let msdVaWSTETH: DepositToken
  let msUSDDebt: DebtToken
  let msOPDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msOP: SyntheticToken
  let msETH: SyntheticToken

  if (isNodeHardhat) {
    before(enableForking)

    after(disableForking)
  }

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()

    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, alice)
    op = await ethers.getContractAt('ERC20', Address.OP_ADDRESS, alice)
    weth = await ethers.getContractAt('IWETH', Address.WETH_ADDRESS, alice)
    vaUSDC = await ethers.getContractAt('ERC20', Address.VAUSDC_ADDRESS, alice)
    vaETH = await ethers.getContractAt('ERC20', Address.VAETH_ADDRESS, alice)
    vaOP = await ethers.getContractAt('ERC20', Address.VAOP_ADDRESS, alice)
    vawstETH = await ethers.getContractAt('ERC20', Address.VAWSTETH_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = await ethers.getContractAt('Pool', pool1Address, alice)

    msdUSDC = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdOP = await ethers.getContractAt('DepositToken', OP_DEPOSIT_ADDRESS, alice)
    msdWETH = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_ADDRESS, alice)
    msdVaOP = await ethers.getContractAt('DepositToken', VAOP_DEPOSIT_ADDRESS, alice)
    msdVaUSDC = await ethers.getContractAt('DepositToken', VAUSDC_DEPOSIT_ADDRESS, alice)
    msdVaETH = await ethers.getContractAt('DepositToken', VAETH_DEPOSIT_ADDRESS, alice)
    msdVaWSTETH = await ethers.getContractAt('DepositToken', VAWSTETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = await ethers.getContractAt('DebtToken', MSUSD_DEBT_ADDRESS, alice)
    msOPDebt = await ethers.getContractAt('DebtToken', MSOP_DEBT_ADDRESS, alice)
    msETHDebt = await ethers.getContractAt('DebtToken', MSETH_DEBT_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msOP = await ethers.getContractAt('SyntheticToken', MSOP_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    expect(await usdc.balanceOf(alice.address)).gt(0)
    await setTokenBalance(op.address, alice.address, parseUnits('1,000', 18))
    expect(await op.balanceOf(alice.address)).gt(0)
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    expect(await weth.balanceOf(alice.address)).gt(0)
    await setTokenBalance(vaUSDC.address, alice.address, parseUnits('10,000', 18))
    expect(await vaUSDC.balanceOf(alice.address)).gt(0)
    await setTokenBalance(vaETH.address, alice.address, parseUnits('1,000', 18))
    expect(await vaETH.balanceOf(alice.address)).gt(0)
    await setTokenBalance(vaOP.address, alice.address, parseUnits('1,000', 18))
    expect(await vaOP.balanceOf(alice.address)).gt(0)
    await setTokenBalance(vawstETH.address, alice.address, parseUnits('20', 18))
    expect(await vawstETH.balanceOf(alice.address)).gt(0)

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await op.connect(alice).approve(msdOP.address, MaxUint256)
    await vaOP.connect(alice).approve(msdVaOP.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH.address, MaxUint256)
    await vawstETH.connect(alice).approve(msdVaWSTETH.address, MaxUint256)

    const masterOracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
    masterOracle = new ethers.Contract(
      Address.MASTER_ORACLE_ADDRESS,
      [
        'function defaultOracle() view returns(address)',
        'function getPriceInUsd(address) view returns(uint256)',
        'function updateTokenOracle(address,address)',
      ],
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

    if (!isNodeHardhat && process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool.poolRegistry())
      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(OP_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(op.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(VAUSDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaUSDC.address))
      expect(VAETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaETH.address))
      expect(VAOP_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaOP.address))
      expect(VAWSTETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vawstETH.address))
      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSOP_DEBT_ADDRESS).eq(await pool.debtTokenOf(msOP.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(op.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaUSDC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaOP.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vawstETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msOP.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msETH.address)).gt(0)
    })
  })

  describe('synth optimism end to end sanity tests', function () {
    it('should deposit USDC', async function () {
      // given
      const amount = parseUnits('1', 6)

      // when
      const tx = () => msdUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDC, alice, amount)
    })

    it('should deposit OP', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdOP.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdOP, alice, amount)
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

    it('should deposit vaUSDC', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaUSDC, alice, amount)
    })

    it('should deposit vaETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaETH, alice, amount)
    })

    it('should deposit vaOP', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaOP.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaOP, alice, amount)
    })

    it('should deposit vawstETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaWSTETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaWSTETH, alice, amount)
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

    it('should issue msOP', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 8)
      const tx = () => msOPDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msOP, alice, amount)
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
      const debtBefore = await msUSDDebt.balanceOf(alice.address)

      // when
      const interestRate = parseEther('0.02') // 2%
      await msUSDDebt.connect(governor).updateInterestRate(interestRate)
      await time.increase(time.duration.years(1))
      await msUSDDebt.accrueInterest()

      // then
      const expectedDebt = debtBefore.mul(parseEther('1').add(interestRate)).div(parseEther('1'))
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, parseEther('0.01'))
    })

    it('should liquidate unhealthy position', async function () {
      // given
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0')) // 0%
      const {_issuableInUsd} = await pool.debtPositionOf(alice.address)
      await msUSDDebt.issue(_issuableInUsd, alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0.5')) // 50%
      await time.increase(time.duration.minutes(10))
      await msUSDDebt.accrueInterest()
      expect((await pool.debtPositionOf(alice.address))._isHealthy).false

      // when
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), bob.address)
      await msUSDDebt.connect(bob).issue(parseEther('100'), bob.address)
      const amountToRepay = parseEther('50') // repay all user's debt
      const tx = await pool.connect(bob).liquidate(msUSD.address, alice.address, amountToRepay, msdUSDC.address)

      // then
      await expect(tx).emit(pool, 'PositionLiquidated')
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
      expect(debtsAfter).closeTo(debtBefore, parseEther('0.0001'))
    })

    it('should repay', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt.issue(debtToIssue, alice.address)
      const msUSDDebtBalance = await msUSDDebt.balanceOf(alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)

      // when
      const debtToRepay = parseEther('0.5')
      const repayFee = parseEther('0')
      const debtPlusRepayFee = debtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
      await msUSDDebt.repay(alice.address, debtPlusRepayFee)

      // then
      expect(await msUSDDebt.balanceOf(alice.address)).lt(msUSDDebtBalance)
    })

    it('should revert if repaying using wrong synthetic asset', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt.issue(debtToIssue, alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)
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

    // TODO some tests are skipped as there is no liquidity
    describe('leverage', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
      })

      it.skip('should leverage vaUSDC->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(pool.address, MaxUint256)
        const tx = await pool.leverage(vaUSDC.address, msdVaUSDC.address, msUSD.address, amountIn, leverage, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountIn.mul(leverage).div(parseEther('1')), parseEther('10')) // ~$150
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
      })

      it.skip('should leverage vaOP->msOP', async function () {
        // when
        const amountIn = parseUnits('1000', 18)
        const amountInUsd = parseUnits('1.81', 18) // approx.
        const leverage = parseEther('1.5')
        await vaOP.connect(alice).approve(pool.address, MaxUint256)
        const tx = await pool.leverage(vaOP.address, msdVaOP.address, msOP.address, amountIn, leverage, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$2,715
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$950
      })

      it('should leverage vaETH->msETH', async function () {
        // when
        const amountIn = parseUnits('1', 18)
        const amountInUsd = parseUnits('1,750', 18) // approx.
        const leverage = parseEther('1.5')
        await vaETH.connect(alice).approve(pool.address, MaxUint256)
        const tx = await pool.leverage(vaETH.address, msdVaETH.address, msETH.address, amountIn, leverage, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$2,850
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$950
      })

      it('should leverage vawstETH->msETH', async function () {
        // when
        const amountIn = parseUnits('1', 18)
        const amountInUsd = parseUnits('1,950', 18) // approx.
        const leverage = parseEther('1.5')
        await vawstETH.connect(alice).approve(pool.address, MaxUint256)
        const tx = await pool.leverage(vawstETH.address, msdVaWSTETH.address, msETH.address, amountIn, leverage, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$3,120
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$975
      })
    })

    describe('flashRepay', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
        const amountIn = parseEther('1')
        const leverage = parseEther('2')
        await vawstETH.connect(alice).approve(pool.address, MaxUint256)
        await pool.connect(alice).leverage(vawstETH.address, msdVaWSTETH.address, msETH.address, amountIn, leverage, 0)
      })

      it('should flash repay msETH debt using vawstETH', async function () {
        // when
        const withdrawAmount = parseEther('0.9')
        const tx = await pool.connect(alice).flashRepay(msETH.address, msdVaWSTETH.address, withdrawAmount, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed).lt(2e6)
        const {_debtInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).closeTo(parseEther('110'), parseEther('5'))
      })
    })
    describe('rewards', function () {
      // TODO
    })
  })
})
