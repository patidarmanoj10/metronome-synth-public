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
let DAI_DEPOSIT_ADDRESS: string
let WBTC_DEPOSIT_ADDRESS: string
let FRAX_DEPOSIT_ADDRESS: string
let WETH_DEPOSIT_ADDRESS: string
let VAFRAX_DEPOSIT_ADDRESS: string
let VAUSDC_DEPOSIT_ADDRESS: string
let VAETH_DEPOSIT_ADDRESS: string
let MSUSD_DEBT_ADDRESS: string
let MSBTC_DEBT_ADDRESS: string
let MSETH_DEBT_ADDRESS: string
let MSUSD_SYNTHETIC_ADDRESS: string
let MSBTC_SYNTHETIC_ADDRESS: string
let MSETH_SYNTHETIC_ADDRESS: string
let NATIVE_TOKEN_GATEWAY_ADDRESS: string
let SRFXETH_DEPOSIT_ADDRESS: string
let VASTETH_DEPOSIT_ADDRESS: string
let VARETH_DEPOSIT_ADDRESS: string
let VACBETH_DEPOSIT_ADDRESS: string
let QUOTER_ADDRESS: string
let MSUSD_PROXYOFT_ADDRESS: string
let MSETH_PROXYOFT_ADDRESS: string
let MSBTC_PROXYOFT_ADDRESS: string
let SMART_FARMING_MANAGER_ADDRESS: string
let CROSS_CHAIN_DISPATCHER_ADDRESS: string

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * This test suite exercises the state of the protocol after running deployment scripts on top of a forked chain
 * In summary:
 * 1) run hardhat node forking mainnet
 * 2) run deployment scripts against localhost node
 * 3) run this test suite
 * See more: `../docs/deployment-e2e-tests.md`
 */
describe.skip('E2E tests (next mainnet release)', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let usdc: ERC20
  let dai: ERC20
  let wbtc: ERC20
  let frax: ERC20
  let weth: IWETH
  let vaFRAX: ERC20
  let vaUSDC: ERC20
  let vaETH: ERC20
  let sfrxETH: ERC20
  let vaSTETH: ERC20
  let vaRETH: ERC20
  let vaCBETH: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let smartFarmingManager: SmartFarmingManager
  let crossChainDispatcher: CrossChainDispatcher
  let quoter: Quoter
  let pool: Pool
  let msdUSDC: DepositToken
  let msdWBTC: DepositToken
  let msdDAI: DepositToken
  let msdFRAX: DepositToken
  let msdWETH: DepositToken
  let msdVaFRAX: DepositToken
  let msdVaUSDC: DepositToken
  let msdVaETH: DepositToken
  let msdSfrxETH: DepositToken
  let msdVaSTETH: DepositToken
  let msdVaRETH: DepositToken
  let msdVaCBETH: DepositToken
  let msUSDDebt: DebtToken
  let msBTCDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msBTC: SyntheticToken
  let msETH: SyntheticToken
  let msUSDProxyOFT: ProxyOFT
  let msBTCProxyOFT: ProxyOFT
  let msETHProxyOFT: ProxyOFT

  async function fixture() {
    // Note: Using dynamic import otherwise test will fail when `/deployments/localhost` doesn't exist
    ;({address: POOL_REGISTRY_ADDRESS} = await import('../deployments/localhost/PoolRegistry.json'))
    ;({address: USDC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/USDCDepositToken.json'))
    ;({address: DAI_DEPOSIT_ADDRESS} = await import('../deployments/localhost/DAIDepositToken.json'))
    ;({address: WBTC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/WBTCDepositToken.json'))
    ;({address: FRAX_DEPOSIT_ADDRESS} = await import('../deployments/localhost/FRAXDepositToken.json'))
    ;({address: WETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/WETHDepositToken.json'))
    ;({address: VAFRAX_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaFRAXDepositToken.json'))
    ;({address: VAUSDC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaUSDCDepositToken.json'))
    ;({address: VAETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaETHDepositToken.json'))
    ;({address: MSUSD_DEBT_ADDRESS} = await import('../deployments/localhost/MsUSDDebt.json'))
    ;({address: MSBTC_DEBT_ADDRESS} = await import('../deployments/localhost/MsBTCDebt.json'))
    ;({address: MSETH_DEBT_ADDRESS} = await import('../deployments/localhost/MsETHDebt.json'))
    ;({address: MSUSD_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsUSDSynthetic.json'))
    ;({address: MSBTC_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsBTCSynthetic.json'))
    ;({address: MSETH_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsETHSynthetic.json'))
    ;({address: NATIVE_TOKEN_GATEWAY_ADDRESS} = await import('../deployments/localhost/NativeTokenGateway.json'))
    ;({address: SRFXETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/sfrxETHDepositToken.json'))
    ;({address: VASTETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaSTETHDepositToken.json'))
    ;({address: VARETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaRETHDepositToken.json'))
    ;({address: VACBETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/vaCBETHDepositToken.json'))
    ;({address: QUOTER_ADDRESS} = await import('../deployments/localhost/Quoter.json'))
    ;({address: MSUSD_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsUSDProxyOFT.json'))
    ;({address: MSETH_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsETHProxyOFT.json'))
    ;({address: MSBTC_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsBTCProxyOFT.json'))
    ;({address: SMART_FARMING_MANAGER_ADDRESS} = await import('../deployments/localhost/SmartFarmingManager.json'))
    ;({address: CROSS_CHAIN_DISPATCHER_ADDRESS} = await import('../deployments/localhost/CrossChainDispatcher.json'))

    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, alice)
    dai = await ethers.getContractAt('ERC20', Address.DAI_ADDRESS, alice)
    wbtc = await ethers.getContractAt('ERC20', Address.WBTC_ADDRESS, alice)
    frax = await ethers.getContractAt('ERC20', Address.FRAX_ADDRESS, alice)
    weth = await ethers.getContractAt('IWETH', Address.WETH_ADDRESS, alice)
    vaFRAX = await ethers.getContractAt('ERC20', Address.VAFRAX_ADDRESS, alice)
    vaUSDC = await ethers.getContractAt('ERC20', Address.VAUSDC_ADDRESS, alice)
    vaETH = await ethers.getContractAt('ERC20', Address.VAETH_ADDRESS, alice)
    sfrxETH = await ethers.getContractAt('ERC20', Address.SFRXETH_ADDRESS, alice)
    vaSTETH = await ethers.getContractAt('ERC20', Address.VASTETH_ADDRESS, alice)
    vaRETH = await ethers.getContractAt('ERC20', Address.VARETH_ADDRESS, alice)
    vaCBETH = await ethers.getContractAt('ERC20', Address.VACBETH_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)

    msdUSDC = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdDAI = await ethers.getContractAt('DepositToken', DAI_DEPOSIT_ADDRESS, alice) // 18 decimals
    msdWBTC = await ethers.getContractAt('DepositToken', WBTC_DEPOSIT_ADDRESS, alice)
    msdFRAX = await ethers.getContractAt('DepositToken', FRAX_DEPOSIT_ADDRESS, alice)
    msdWETH = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_ADDRESS, alice)
    msdVaFRAX = await ethers.getContractAt('DepositToken', VAFRAX_DEPOSIT_ADDRESS, alice)
    msdVaUSDC = await ethers.getContractAt('DepositToken', VAUSDC_DEPOSIT_ADDRESS, alice)
    msdVaETH = await ethers.getContractAt('DepositToken', VAETH_DEPOSIT_ADDRESS, alice)
    msdSfrxETH = await ethers.getContractAt('DepositToken', SRFXETH_DEPOSIT_ADDRESS, alice)
    msdVaSTETH = await ethers.getContractAt('DepositToken', VASTETH_DEPOSIT_ADDRESS, alice)
    msdVaRETH = await ethers.getContractAt('DepositToken', VARETH_DEPOSIT_ADDRESS, alice)
    msdVaCBETH = await ethers.getContractAt('DepositToken', VACBETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = await ethers.getContractAt('DebtToken', MSUSD_DEBT_ADDRESS, alice)
    msBTCDebt = await ethers.getContractAt('DebtToken', MSBTC_DEBT_ADDRESS, alice)
    msETHDebt = await ethers.getContractAt('DebtToken', MSETH_DEBT_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msBTC = await ethers.getContractAt('SyntheticToken', MSBTC_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
    msETHProxyOFT = await ethers.getContractAt('ProxyOFT', MSETH_PROXYOFT_ADDRESS, alice)
    msBTCProxyOFT = await ethers.getContractAt('ProxyOFT', MSBTC_PROXYOFT_ADDRESS, alice)

    smartFarmingManager = await ethers.getContractAt('SmartFarmingManager', SMART_FARMING_MANAGER_ADDRESS, alice)
    crossChainDispatcher = await ethers.getContractAt('CrossChainDispatcher', CROSS_CHAIN_DISPATCHER_ADDRESS, alice)
    quoter = await ethers.getContractAt('Quoter', QUOTER_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(dai.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(wbtc.address, alice.address, parseUnits('10', 8))
    await setTokenBalance(frax.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaFRAX.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaUSDC.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaETH.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(sfrxETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaSTETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaRETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaCBETH.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await dai.connect(alice).approve(msdDAI.address, MaxUint256)
    await wbtc.connect(alice).approve(msdWBTC.address, MaxUint256)
    await frax.connect(alice).approve(msdFRAX.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaFRAX.connect(alice).approve(msdVaFRAX.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH.address, MaxUint256)
    await sfrxETH.connect(alice).approve(msdSfrxETH.address, MaxUint256)
    await vaSTETH.connect(alice).approve(msdVaSTETH.address, MaxUint256)
    await vaRETH.connect(alice).approve(msdVaRETH.address, MaxUint256)
    await vaCBETH.connect(alice).approve(msdVaCBETH.address, MaxUint256)

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
      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(DAI_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(dai.address))
      expect(WBTC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(wbtc.address))
      expect(FRAX_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(frax.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(VAETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaETH.address))
      expect(VAFRAX_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaFRAX.address))
      expect(VAUSDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaUSDC.address))
      expect(SRFXETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(sfrxETH.address))
      expect(VASTETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaSTETH.address))
      expect(VARETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaRETH.address))
      expect(VACBETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaCBETH.address))
      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSBTC_DEBT_ADDRESS).eq(await pool.debtTokenOf(msBTC.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))

      expect(CROSS_CHAIN_DISPATCHER_ADDRESS).eq(await poolRegistry.crossChainDispatcher())
      expect(SMART_FARMING_MANAGER_ADDRESS).eq(await pool.smartFarmingManager())
      expect(pool.address).eq(await smartFarmingManager.pool())
      expect(QUOTER_ADDRESS).eq(await poolRegistry.quoter())
      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
      expect(MSETH_PROXYOFT_ADDRESS).eq(await msETH.proxyOFT())
      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSBTC_SYNTHETIC_ADDRESS).eq(await msBTCProxyOFT.token())
      expect(MSETH_SYNTHETIC_ADDRESS).eq(await msETHProxyOFT.token())
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(dai.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(wbtc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(frax.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaFRAX.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaUSDC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msBTC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(sfrxETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaSTETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaRETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaCBETH.address)).gt(0)
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
      const tx = () => msdDAI.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdDAI, alice, amount)
    })

    it('should deposit FRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdFRAX.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdFRAX, alice, amount)
    })

    it('should deposit WBTC', async function () {
      // given
      const amount = parseUnits('1', 8)

      // when
      const tx = () => msdWBTC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWBTC, alice, amount)
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

    it('should deposit vaFRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaFRAX.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaFRAX, alice, amount)
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

    it('should deposit sfrxETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdSfrxETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdSfrxETH, alice, amount)
    })

    it('should deposit vaSTETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaSTETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaSTETH, alice, amount)
    })

    it('should deposit vaRETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaRETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaRETH, alice, amount)
    })

    it('should deposit vaCBETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaCBETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaCBETH, alice, amount)
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
      const tx = () => msBTCDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msBTC, alice, amount)
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

      it('should leverage vaUSDC->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaUSDC.address,
          msdVaUSDC.address,
          msUSD.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(parseEther('160'), parseEther('10'))
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
      })

      it('should leverage vaFRAX->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaFRAX.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaFRAX.address,
          msdVaFRAX.address,
          msUSD.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(parseEther('160'), parseEther('10'))
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
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

      it('should leverage varETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('204', 18) // approx.
        const leverage = parseEther('1.5')
        await vaRETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaRETH.address,
          msdVaRETH.address,
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

      it('should leverage vastETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('195', 18) // approx.
        const leverage = parseEther('1.5')
        await vaSTETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaSTETH.address,
          msdVaSTETH.address,
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

      it('should leverage vacbETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('197', 18) // approx.
        const leverage = parseEther('1.5')
        await vaCBETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaCBETH.address,
          msdVaCBETH.address,
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
    })

    describe('flashRepay', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        await smartFarmingManager.leverage(vaUSDC.address, msdVaUSDC.address, msUSD.address, amountIn, leverage, 0)
      })

      it('should flash repay msUSD debt using vaUSDC', async function () {
        // when
        const withdrawAmount = parseEther('45')
        const tx = await smartFarmingManager.flashRepay(msUSD.address, msdVaUSDC.address, withdrawAmount, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1e6))
        const {_debtInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).closeTo(0, parseEther('10'))
      })
    })

    describe('cross-chain operations', function () {
      const LZ_MAINNET_ID = 101
      const LZ_OP_ID = 110
      const SG_USDC_POOL_ID = 1

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

        await msUSDProxyOFT.connect(governor).setMinDstGas(LZ_OP_ID, await msUSDProxyOFT.PT_SEND(), 200000)

        if (!(await msUSD.maxBridgedInSupply()).eq(ethers.constants.MaxUint256)) {
          await msUSD.connect(governor).updateMaxBridgedInSupply(ethers.constants.MaxUint256)
        }

        if (!(await msUSD.maxBridgedOutSupply()).eq(ethers.constants.MaxUint256)) {
          await msUSD.connect(governor).updateMaxBridgedOutSupply(ethers.constants.MaxUint256)
        }

        await msUSDProxyOFT
          .connect(governor)
          .setTrustedRemote(
            LZ_OP_ID,
            ethers.utils.solidityPack(['address', 'address'], [msUSDProxyOFT.address, msUSDProxyOFT.address])
          )

        if (!(await crossChainDispatcher.stargatePoolIdOf(usdc.address)).eq(SG_USDC_POOL_ID)) {
          await crossChainDispatcher.connect(governor).updateStargatePoolIdOf(usdc.address, SG_USDC_POOL_ID)
        }
      })

      it('crossChainLeverage', async function () {
        // given
        expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        const swapAmountOutMin = 0
        const depositAmountOutMin = 0
        const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
        const fee = parseEther('0.5')
        await dai.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        await smartFarmingManager.crossChainLeverage(
          dai.address,
          msdVaUSDC.address,
          msUSD.address,
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
          const amountIn = parseUnits('100', 18)
          const leverage = parseEther('1.5')
          await vaUSDC.connect(alice).approve(smartFarmingManager.address, MaxUint256)
          await smartFarmingManager.leverage(vaUSDC.address, msdVaUSDC.address, msUSD.address, amountIn, leverage, 0)

          // Note: Adds vaUSDC->USDC routing
          // TODO: Remove after having this step done on Swapper side
          const swapper = new ethers.Contract(
            await poolRegistry.swapper(),
            ['function setExactInputRouting(address,address,bytes)'],
            governor
          )
          await swapper.setExactInputRouting(
            vaUSDC.address,
            usdc.address,
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000639C9e4563A0CA81a1FeE7d6B48128DAF2Cf9531000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002451cff8d9000000000000000000000000a8b607aa09b6a2e306f93e74c282fb13f6a8045200000000000000000000000000000000000000000000000000000000'
          )
        })

        it('crossChainFlashRepay', async function () {
          // given
          expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

          // when
          const withdrawAmount = parseUnits('30', 18)
          const underlyingAmountOutMin = 0
          const swapAmountOutMin = 0
          const repayAmountOutMin = 0
          const lzArgs = await quoter.getFlashRepaySwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
          const fee = parseEther('0.5')

          await smartFarmingManager.crossChainFlashRepay(
            msUSD.address,
            msdVaUSDC.address,
            withdrawAmount,
            usdc.address,
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
