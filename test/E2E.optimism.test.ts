/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {disableForking, enableForking, impersonateAccount, setTokenBalance} from './helpers'
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
import {CrossChainLib} from './helpers/CrossChainLib'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/optimism/PoolRegistry.json'
import {address as WETH_DEPOSIT_ADDRESS} from '../deployments/optimism/WETHDepositToken_Pool1.json'
import {address as OP_DEPOSIT_ADDRESS} from '../deployments/optimism/OPDepositToken_Pool1.json'
import {address as USDC_DEPOSIT_ADDRESS} from '../deployments/optimism/USDCDepositToken_Pool1.json'
import {address as VAETH_DEPOSIT_ADDRESS} from '../deployments/optimism/VaETHDepositToken_Pool1.json'
import {address as VAOP_DEPOSIT_ADDRESS} from '../deployments/optimism/VaOPDepositToken_Pool1.json'
import {address as VAUSDC_DEPOSIT_ADDRESS} from '../deployments/optimism/VaUSDCDepositToken_Pool1.json'
import {address as VAWSTETH_DEPOSIT_ADDRESS} from '../deployments/optimism/VaWSTETHDepositToken_Pool1.json'
import {address as MSUSD_DEBT_ADDRESS} from '../deployments/optimism/MsUSDDebt_Pool1.json'
import {address as MSOP_DEBT_ADDRESS} from '../deployments/optimism/MsOPDebt_Pool1.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/optimism/MsETHDebt_Pool1.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/optimism/MsUSDSynthetic.json'
import {address as MSBTC_SYNTHETIC_ADDRESS} from '../deployments/optimism/MsOPSynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/optimism/MsETHSynthetic.json'
import {address as MSUSD_PROXYOFT_ADDRESS} from '../deployments/optimism/MsUSDProxyOFT.json'
import {address as MSETH_PROXYOFT_ADDRESS} from '../deployments/optimism/MsETHProxyOFT.json'
import {address as NATIVE_TOKEN_GATEWAY_ADDRESS} from '../deployments/optimism/NativeTokenGateway.json'
import {address as QUOTER_ADDRESS} from '../deployments/optimism/Quoter.json'
import {address as SMART_FARMING_MANAGER_ADDRESS} from '../deployments/optimism/SmartFarmingManager_Pool1.json'
import {address as CROSS_CHAIN_DISPATCHER_ADDRESS} from '../deployments/optimism/CrossChainDispatcher.json'

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * The goal of this test suite is to test current state of the optimism's contracts
 * Note: When we have on-going changes the TypesChain types may be different than the deployed contracts
 * For these cases, use `new ethers.Contract()` instead and amend ABI manually
 */
// Note: Skipping for now because the tests use mainnet by default
describe.skip('E2E tests (optimism)', function () {
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
    vaOP = await ethers.getContractAt('ERC20', Address.VAOP_ADDRESS, alice)
    vaUSDC = await ethers.getContractAt('ERC20', Address.VAUSDC_ADDRESS, alice)
    vaETH = await ethers.getContractAt('ERC20', Address.VAETH_ADDRESS, alice)
    vaWSTETH = await ethers.getContractAt('ERC20', Address.VAWSTETH_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)

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

    // TODO: Remove when the production cap has enough room
    await msUSDDebt.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)
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

      beforeEach(async function () {
        const isBridgingActive = await crossChainDispatcher.isBridgingActive()
        if (!isBridgingActive) {
          await crossChainDispatcher.connect(governor).toggleBridgingIsActive()
        }
      })

      it('crossChainLeverages', async function () {
        // when
        const id = '19085876106743701664961649015242405312216082383703184670357774050142071594619'

        const {
          dstChainId,
          bridgeToken,
          depositToken,
          syntheticToken,
          amountIn,
          debtAmount,
          depositAmountMin,
          account,
          finished,
        } = await smartFarmingManager.crossChainLeverages(id)

        // then
        expect(dstChainId).eq(LZ_MAINNET_ID)
        expect(bridgeToken).eq(usdc.address)
        expect(depositToken).eq(msdVaUSDC.address)
        expect(syntheticToken).eq(msUSD.address)
        expect(amountIn).eq('100000000')
        expect(debtAmount).eq('49987031500000000000')
        expect(depositAmountMin).eq(1)
        expect(account).eq('0xdf826ff6518e609E4cEE86299d40611C148099d5')
        expect(finished).eq(true)
      })

      it('crossChainLeverage', async function () {
        // given
        const idBefore = await smartFarmingManager.crossChainRequestsLength()

        // when
        const amountIn = parseUnits('1', 18)
        const leverage = parseEther('1.5')
        const swapAmountOutMin = 0
        const depositAmountOutMin = 0
        // Note: This call must be called from the mainnet
        // const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_OP_ID, LZ_MAINNET_ID)
        // Using hard-coded values to make test pass
        const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.1'), '750000')

        const fee = parseEther('0.5')
        await weth.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        await smartFarmingManager[
          'crossChainLeverage(address,address,address,address,uint256,uint256,uint256,uint256,bytes)'
        ](
          weth.address,
          msETH.address,
          weth.address,
          msdVaETH.address,
          amountIn,
          leverage,
          swapAmountOutMin,
          depositAmountOutMin,
          lzArgs,
          {value: fee}
        )

        // then
        expect(await smartFarmingManager.crossChainRequestsLength()).eq(idBefore.add(1))
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
        })

        it('crossChainFlashRepays', async function () {
          // when
          const id = '35117077778332083854144850921247747581371777455700725226394469105255657687432'

          const {dstChainId, syntheticToken, repayAmountMin, account, finished} =
            await smartFarmingManager.crossChainFlashRepays(id)

          // then
          expect(dstChainId).eq(LZ_MAINNET_ID)
          expect(syntheticToken).eq(msUSD.address)
          expect(repayAmountMin).eq(1)
          expect(account).eq('0xdf826ff6518e609E4cEE86299d40611C148099d5')
          expect(finished).eq(true)
        })

        it('crossChainFlashRepay', async function () {
          // given
          const idBefore = await smartFarmingManager.crossChainRequestsLength()

          // when
          const withdrawAmount = parseUnits('0.3', 18)
          const underlyingAmountOutMin = 0
          const swapAmountOutMin = 0
          const repayAmountOutMin = 0

          // Note: This call must be called from the mainnet
          // const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
          // Using hard-coded values to make test pass
          const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.1'), '750000')

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
          expect(await smartFarmingManager.crossChainRequestsLength()).eq(idBefore.add(1))
        })
      })
    })
  })
})
