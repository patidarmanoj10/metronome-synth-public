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
let WETH_DEPOSIT_ADDRESS: string
let MSUSD_DEBT_ADDRESS: string
let MSETH_DEBT_ADDRESS: string
let MSUSD_SYNTHETIC_ADDRESS: string
let MSETH_SYNTHETIC_ADDRESS: string
let NATIVE_TOKEN_GATEWAY_ADDRESS: string
let QUOTER_ADDRESS: string
let MSUSD_PROXYOFT_ADDRESS: string
let MSETH_PROXYOFT_ADDRESS: string
let SFM_ADDRESS: string
let CROSS_CHAIN_DISPATCHER_ADDRESS: string

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * This test suite exercises the state of the protocol after running deployment scripts on top of a forked chain
 * In summary:
 * 1) run hardhat node forking base
 * 2) run deployment scripts against localhost node
 * 3) run this test suite
 * See more: `../docs/deployment-e2e-tests.md`
 */
describe.skip('E2E tests (next base release)', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let weth: IWETH
  let usdc: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let smartFarmingManager: SmartFarmingManager
  let crossChainDispatcher: CrossChainDispatcher
  let quoter: Quoter
  let pool: Pool
  let msdWETH: DepositToken
  let msdUSDC: DepositToken
  let msUSDDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msETH: SyntheticToken
  let msUSDProxyOFT: ProxyOFT
  let msETHProxyOFT: ProxyOFT

  async function fixture() {
    // Note: Using dynamic import otherwise test will fail when `/deployments/localhost` doesn't exist
    ;({address: POOL_REGISTRY_ADDRESS} = await import('../deployments/localhost/PoolRegistry.json'))
    ;({address: WETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/WETHDepositToken_Pool1.json'))
    ;({address: USDC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/USDCDepositToken_Pool1.json'))
    ;({address: MSUSD_DEBT_ADDRESS} = await import('../deployments/localhost/MsUSDDebt_Pool1.json'))
    ;({address: MSETH_DEBT_ADDRESS} = await import('../deployments/localhost/MsETHDebt_Pool1.json'))
    ;({address: MSUSD_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsUSDSynthetic.json'))
    ;({address: MSETH_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsETHSynthetic.json'))
    ;({address: MSUSD_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsUSDProxyOFT.json'))
    ;({address: MSETH_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsETHProxyOFT.json'))
    ;({address: NATIVE_TOKEN_GATEWAY_ADDRESS} = await import('../deployments/localhost/NativeTokenGateway.json'))
    ;({address: QUOTER_ADDRESS} = await import('../deployments/localhost/Quoter.json'))
    ;({address: SFM_ADDRESS} = await import('../deployments/localhost/SmartFarmingManager_Pool1.json'))
    ;({address: CROSS_CHAIN_DISPATCHER_ADDRESS} = await import('../deployments/localhost/CrossChainDispatcher.json'))

    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, alice)
    weth = await ethers.getContractAt('IWETH', Address.WETH_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)

    msdWETH = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_ADDRESS, alice)
    msdUSDC = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.

    msUSDDebt = await ethers.getContractAt('DebtToken', MSUSD_DEBT_ADDRESS, alice)
    msETHDebt = await ethers.getContractAt('DebtToken', MSETH_DEBT_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
    msETHProxyOFT = await ethers.getContractAt('ProxyOFT', MSETH_PROXYOFT_ADDRESS, alice)

    smartFarmingManager = await ethers.getContractAt('SmartFarmingManager', SFM_ADDRESS, alice)
    crossChainDispatcher = await ethers.getContractAt('CrossChainDispatcher', CROSS_CHAIN_DISPATCHER_ADDRESS, alice)
    quoter = await ethers.getContractAt('Quoter', QUOTER_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)

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

    // TODO: Remove when the production cap has enough room
    await msUSDDebt.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)
    await msUSD.connect(governor).toggleIsActive()
    await msETH.connect(governor).toggleIsActive()

    if (await pool.everythingStopped()) {
      await pool.connect(governor).open()
    }

    if (await poolRegistry.everythingStopped()) {
      await poolRegistry.connect(governor).open()
    }

    if (await pool.paused()) {
      await pool.connect(governor).unpause()
    }

    if (await poolRegistry.paused()) {
      await poolRegistry.connect(governor).unpause()
    }

    if (!(await crossChainDispatcher.isBridgingActive())) {
      await crossChainDispatcher.connect(governor).toggleBridgingIsActive()
    }

    if (!(await pool.isBridgingActive())) {
      await pool.connect(governor).toggleBridgingIsActive()
    }

    if (!(await msUSD.isActive())) {
      await msUSD.connect(governor).toggleIsActive()
    }

    if (!(await msETH.isActive())) {
      await msETH.connect(governor).toggleIsActive()
    }
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
      expect(SFM_ADDRESS).eq(await pool.smartFarmingManager())
      expect(pool.address).eq(await smartFarmingManager.pool())
      expect(QUOTER_ADDRESS).eq(await poolRegistry.quoter())

      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))

      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSETH_SYNTHETIC_ADDRESS).eq(await msETHProxyOFT.token())

      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))

      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
      expect(MSETH_PROXYOFT_ADDRESS).eq(await msETH.proxyOFT())
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
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
  })
})
