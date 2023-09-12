/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
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
  SmartFarmingManager,
  CrossChainDispatcher,
  Quoter,
  ProxyOFT,
} from '../typechain'
let POOL_REGISTRY_ADDRESS: string
let USDC_DEPOSIT_ADDRESS: string
let OP_DEPOSIT_ADDRESS: string
let WETH_DEPOSIT_ADDRESS: string
let VAUSDC_DEPOSIT_ADDRESS: string
let VAETH_DEPOSIT_ADDRESS: string
let VAOP_DEPOSIT_ADDRESS: string
let VAWSTETH_DEPOSIT_ADDRESS: string
let MSUSD_DEBT_ADDRESS: string
let MSOP_DEBT_ADDRESS: string
let MSETH_DEBT_ADDRESS: string
let MSUSD_SYNTHETIC_ADDRESS: string
let MSBTC_SYNTHETIC_ADDRESS: string
let MSETH_SYNTHETIC_ADDRESS: string
let NATIVE_TOKEN_GATEWAY_ADDRESS: string
let QUOTER_ADDRESS: string
let MSUSD_PROXYOFT_ADDRESS: string
let MSETH_PROXYOFT_ADDRESS: string
let SMART_FARMING_MANAGER_ADDRESS: string
let CROSS_CHAIN_DISPATCHER_ADDRESS: string

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * This test suite exercises the state of the protocol after running deployment scripts on top of a forked chain
 * In summary:
 * 1) run hardhat node forking optimism
 * 2) run deployment scripts against localhost node
 * 3) run this test suite
 * See more: `../docs/deployment-e2e-tests.md`
 */
describe.skip('E2E tests (next optimism release)', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress

  let weth: IWETH
  let op: ERC20
  let usdc: ERC20
  let vaETH: ERC20
  let vaOP: ERC20
  let vaUSDC: ERC20
  let vaWSTETH: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let smartFarmingManager: SmartFarmingManager
  let crossChainDispatcher: CrossChainDispatcher
  let quoter: Quoter
  let pool: Pool
  let msdWETH: DepositToken
  let msdOP: DepositToken
  let msdUSDC: DepositToken
  let msdVaETH: DepositToken
  let msdVaOP: DepositToken
  let msdVaUSDC: DepositToken
  let msdVaWSTETH: DepositToken
  let msUSDDebt: DebtToken
  let msOPDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msOP: SyntheticToken
  let msETH: SyntheticToken
  let msUSDProxyOFT: ProxyOFT
  let msETHProxyOFT: ProxyOFT

  async function fixture() {
    // Note: Using dynamic import otherwise test will fail when `/deployments/localhost` doesn't exist
    ;({address: POOL_REGISTRY_ADDRESS} = await import('../deployments/localhost/PoolRegistry.json'))
    ;({address: WETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/WETHDepositToken.json'))
    ;({address: OP_DEPOSIT_ADDRESS} = await import('../deployments/localhost/OPDepositToken.json'))
    ;({address: USDC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/USDCDepositToken.json'))
    ;({address: VAETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaETHDepositToken.json'))
    ;({address: VAOP_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaOPDepositToken.json'))
    ;({address: VAUSDC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaUSDCDepositToken.json'))
    ;({address: VAWSTETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaWSTETHDepositToken.json'))
    ;({address: MSUSD_DEBT_ADDRESS} = await import('../deployments/localhost/MsUSDDebt.json'))
    ;({address: MSOP_DEBT_ADDRESS} = await import('../deployments/localhost/MsOPDebt.json'))
    ;({address: MSETH_DEBT_ADDRESS} = await import('../deployments/localhost/MsETHDebt.json'))
    ;({address: MSUSD_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsUSDSynthetic.json'))
    ;({address: MSBTC_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsOPSynthetic.json'))
    ;({address: MSETH_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsETHSynthetic.json'))
    ;({address: MSUSD_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsUSDProxyOFT.json'))
    ;({address: MSETH_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsETHProxyOFT.json'))
    ;({address: NATIVE_TOKEN_GATEWAY_ADDRESS} = await import('../deployments/localhost/NativeTokenGateway.json'))
    ;({address: QUOTER_ADDRESS} = await import('../deployments/localhost/Quoter.json'))
    ;({address: SMART_FARMING_MANAGER_ADDRESS} = await import('../deployments/localhost/SmartFarmingManager.json'))
    ;({address: CROSS_CHAIN_DISPATCHER_ADDRESS} = await import('../deployments/localhost/CrossChainDispatcher.json'))

    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, alice)
    op = await ethers.getContractAt('ERC20', Address.OP_ADDRESS, alice)
    weth = await ethers.getContractAt('IWETH', Address.WETH_ADDRESS, alice)
    vaOP = await ethers.getContractAt('ERC20', Address.VAOP_ADDRESS, alice)
    vaUSDC = await ethers.getContractAt('ERC20', Address.VAUSDC_ADDRESS, alice)
    vaETH = await ethers.getContractAt('ERC20', Address.VAETH_ADDRESS, alice)
    vaWSTETH = await ethers.getContractAt('ERC20', Address.VAWSTETH_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)

    msdWETH = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_ADDRESS, alice)
    msdOP = await ethers.getContractAt('DepositToken', OP_DEPOSIT_ADDRESS, alice) // 18 decimals
    msdUSDC = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdVaETH = await ethers.getContractAt('DepositToken', VAETH_DEPOSIT_ADDRESS, alice)
    msdVaOP = await ethers.getContractAt('DepositToken', VAOP_DEPOSIT_ADDRESS, alice)
    msdVaUSDC = await ethers.getContractAt('DepositToken', VAUSDC_DEPOSIT_ADDRESS, alice)
    msdVaWSTETH = await ethers.getContractAt('DepositToken', VAWSTETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = await ethers.getContractAt('DebtToken', MSUSD_DEBT_ADDRESS, alice)
    msOPDebt = await ethers.getContractAt('DebtToken', MSOP_DEBT_ADDRESS, alice)
    msETHDebt = await ethers.getContractAt('DebtToken', MSETH_DEBT_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msOP = await ethers.getContractAt('SyntheticToken', MSBTC_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
    msETHProxyOFT = await ethers.getContractAt('ProxyOFT', MSETH_PROXYOFT_ADDRESS, alice)

    smartFarmingManager = await ethers.getContractAt('SmartFarmingManager', SMART_FARMING_MANAGER_ADDRESS, alice)
    crossChainDispatcher = await ethers.getContractAt('CrossChainDispatcher', CROSS_CHAIN_DISPATCHER_ADDRESS, alice)
    quoter = await ethers.getContractAt('Quoter', QUOTER_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(op.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaOP.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaUSDC.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaETH.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaWSTETH.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await op.connect(alice).approve(msdOP.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH.address, MaxUint256)
    await vaWSTETH.connect(alice).approve(msdVaWSTETH.address, MaxUint256)
    await vaOP.connect(alice).approve(msdVaOP.address, MaxUint256)

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

    if (isNodeHardhat) {
      throw Error('This test suite must be run against localhost node')
    }

    if (process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool.poolRegistry())
      expect(CROSS_CHAIN_DISPATCHER_ADDRESS).eq(await poolRegistry.crossChainDispatcher())
      expect(SMART_FARMING_MANAGER_ADDRESS).eq(await pool.smartFarmingManager())
      expect(pool.address).eq(await smartFarmingManager.pool())
      expect(QUOTER_ADDRESS).eq(await poolRegistry.quoter())

      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(OP_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(op.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(VAUSDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaUSDC.address))
      expect(VAETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaETH.address))
      expect(VAOP_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaOP.address))

      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSETH_SYNTHETIC_ADDRESS).eq(await msETHProxyOFT.token())

      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSOP_DEBT_ADDRESS).eq(await pool.debtTokenOf(msOP.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))

      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
      expect(MSETH_PROXYOFT_ADDRESS).eq(await msETH.proxyOFT())
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(op.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaOP.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaUSDC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaWSTETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msOP.address)).gt(0)
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

    it('should deposit DAI', async function () {
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

    it('should deposit vaUSDC using USDC', async function () {
      //
      // Deploy `VesperGateway` implementation
      // Note: It won't be necessary when this contract get online
      //
      const vesperGatewayFactory = await ethers.getContractFactory('VesperGateway', alice)
      const vesperGateway = await vesperGatewayFactory.deploy(poolRegistry.address)

      // given
      const amount6 = parseUnits('1', 6)
      const amount18 = parseUnits('1', 18)
      const before = await msdVaUSDC.balanceOf(alice.address)
      expect(before).eq(0)

      // when
      await usdc.approve(vesperGateway.address, amount6)
      await vesperGateway.deposit(pool.address, vaUSDC.address, amount6)

      // then
      const after = await msdVaUSDC.balanceOf(alice.address)
      expect(after).closeTo(amount18, parseUnits('0.1', 18))
    })

    it('should deposit vaETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaETH, alice, amount)
    })

    it('should deposit vaWSTETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaWSTETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaWSTETH, alice, amount)
    })

    it('should deposit vaOP', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaOP.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaOP, alice, amount)
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

    it('should issue msBTC', async function () {
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

    describe('leverage', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
      })

      it('should leverage vaETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('190', 18) // approx.
        const leverage = parseEther('1.5')
        await vaETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaETH.address,
          msdVaETH.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$285
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$95
      })

      it('should leverage vawstETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('195', 18) // approx.
        const leverage = parseEther('1.5')
        await vaWSTETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaWSTETH.address,
          msdVaWSTETH.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$292
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$97
      })
    })

    describe('flashRepay', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
        const amountIn = parseUnits('1', 18)
        const leverage = parseEther('1.5')
        await vaETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        await smartFarmingManager.leverage(vaETH.address, msdVaETH.address, msETH.address, amountIn, leverage, 0)
      })

      it('should flash repay msETH debt using vaETH', async function () {
        // when
        const withdrawAmount = parseEther('0.45')
        const tx = await smartFarmingManager.flashRepay(msETH.address, msdVaETH.address, withdrawAmount, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1e6))
        const {_debtInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).closeTo(0, parseEther('100'))
      })
    })

    describe('cross-chain operations', function () {
      const LZ_MAINNET_ID = 101
      const LZ_OP_ID = 110

      beforeEach(async function () {
        //
        // Note: The setup below are temporary just to make tests to pass
        // TODO: Move to deployment scripts as soon we have final values to set
        //
        if (!(await crossChainDispatcher.isBridgingActive())) {
          await crossChainDispatcher.connect(governor).toggleBridgingIsActive()
        }

        if (!(await crossChainDispatcher.isDestinationChainSupported(LZ_OP_ID))) {
          await crossChainDispatcher.connect(governor).toggleDestinationChainIsActive(LZ_OP_ID)
        }

        if ((await crossChainDispatcher.crossChainDispatcherOf(LZ_OP_ID)) !== crossChainDispatcher.address) {
          await crossChainDispatcher
            .connect(governor)
            .updateCrossChainDispatcherOf(LZ_OP_ID, crossChainDispatcher.address)
        }

        if (!(await msETH.maxBridgedInSupply()).eq(ethers.constants.MaxUint256)) {
          await msETH.connect(governor).updateMaxBridgedInSupply(ethers.constants.MaxUint256)
        }

        if (!(await msETH.maxBridgedOutSupply()).eq(ethers.constants.MaxUint256)) {
          await msETH.connect(governor).updateMaxBridgedOutSupply(ethers.constants.MaxUint256)
        }

        await msETHProxyOFT
          .connect(governor)
          .setTrustedRemote(
            LZ_OP_ID,
            ethers.utils.solidityPack(['address', 'address'], [msETHProxyOFT.address, msETHProxyOFT.address])
          )
      })

      it('crossChainLeverage', async function () {
        // given
        expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

        // when
        const amountIn = parseUnits('1', 18)
        const leverage = parseEther('1.5')
        const swapAmountOutMin = 0
        const depositAmountOutMin = 0
        const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
        const fee = parseEther('0.5')
        await weth.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        await smartFarmingManager.crossChainLeverage(
          weth.address,
          msdVaETH.address,
          msETH.address,
          amountIn,
          leverage,
          swapAmountOutMin,
          depositAmountOutMin,
          lzArgs,
          {value: fee}
        )

        // then
        expect(await smartFarmingManager.crossChainRequestsLength()).eq(1)
      })

      describe('crossChainFlashRepay', function () {
        beforeEach(async function () {
          const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
          expect(_debtInUsd).eq(0)
          expect(_depositInUsd).eq(0)
          const amountIn = parseUnits('1', 18)
          const leverage = parseEther('1.5')
          await vaETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
          await smartFarmingManager.leverage(vaETH.address, msdVaETH.address, msETH.address, amountIn, leverage, 0)

          // Note: Adds vaETH->WETH routing
          // TODO: Remove after having this step done on Swapper side
          const swapper = new ethers.Contract(
            await poolRegistry.swapper(),
            ['function setExactInputRouting(address,address,bytes)'],
            governor
          )
          await swapper.setExactInputRouting(
            vaETH.address,
            weth.address,
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000009a92b76fA1782f60bcaf76E7DDa1e2b8Dc9e2493000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002451cff8d9000000000000000000000000CcF3d1AcF799bAe67F6e354d685295557cf6476100000000000000000000000000000000000000000000000000000000'
          )
        })

        it('crossChainFlashRepay', async function () {
          // given
          expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

          // when
          const withdrawAmount = parseUnits('0.3', 18)
          const underlyingAmountOutMin = 0
          const swapAmountOutMin = 0
          const repayAmountOutMin = 0
          const lzArgs = await quoter.getFlashRepaySwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
          const fee = parseEther('0.5')

          await smartFarmingManager.crossChainFlashRepay(
            msETH.address,
            msdVaETH.address,
            withdrawAmount,
            weth.address,
            underlyingAmountOutMin,
            swapAmountOutMin,
            repayAmountOutMin,
            lzArgs,
            {value: fee}
          )

          // then
          expect(await smartFarmingManager.crossChainRequestsLength()).eq(1)
        })
      })
    })
  })
})
