/* eslint-disable camelcase */
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
  FeeProvider,
  Treasury,
} from '../typechain'
import {CrossChainLib} from './helpers/CrossChainLib'
let POOL_REGISTRY_ADDRESS: string
let CROSS_CHAIN_DISPATCHER_ADDRESS: string
let QUOTER_ADDRESS: string
let NATIVE_TOKEN_GATEWAY_ADDRESS: string
let MSUSD_SYNTHETIC_ADDRESS: string
let MSBTC_SYNTHETIC_ADDRESS: string
let MSETH_SYNTHETIC_ADDRESS: string
let MSUSD_PROXYOFT_ADDRESS: string
let MSETH_PROXYOFT_ADDRESS: string
let SFM_POOL1_ADDRESS: string
let FEE_PROVIDER_POOL1_ADDRESS: string
let TREASURY_POOL1_ADDRESS: string
let USDC_DEPOSIT_POOL1_ADDRESS: string
let DAI_DEPOSIT_POOL1_ADDRESS: string
let WBTC_DEPOSIT_POOL1_ADDRESS: string
let FRAX_DEPOSIT_POOL1_ADDRESS: string
let WETH_DEPOSIT_POOL1_ADDRESS: string
let VAFRAX_DEPOSIT_POOL1_ADDRESS: string
let VAUSDC_DEPOSIT_POOL1_ADDRESS: string
let VAETH_DEPOSIT_POOL1_ADDRESS: string
let SRFXETH_DEPOSIT_POOL1_ADDRESS: string
let VASTETH_DEPOSIT_POOL1_ADDRESS: string
let VARETH_DEPOSIT_POOL1_ADDRESS: string
let VACBETH_DEPOSIT_POOL1_ADDRESS: string
let MSUSD_DEBT_POOL1_ADDRESS: string
let MSBTC_DEBT_POOL1_ADDRESS: string
let MSETH_DEBT_POOL1_ADDRESS: string
let SFM_POOL2_ADDRESS: string
let FEE_PROVIDER_POOL2_ADDRESS: string
let TREASURY_POOL2_ADDRESS: string
let USDC_DEPOSIT_POOL2_ADDRESS: string
let MSUSD_DEBT_POOL2_ADDRESS: string

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
  let crossChainDispatcher: CrossChainDispatcher
  let quoter: Quoter
  let pool_1: Pool
  let smartFarmingManager_1: SmartFarmingManager
  let feeProvider_1: FeeProvider
  let treasury_1: Treasury
  let msdUSDC_1: DepositToken
  let msdWBTC_1: DepositToken
  let msdDAI_1: DepositToken
  let msdFRAX_1: DepositToken
  let msdWETH_1: DepositToken
  let msdVaFRAX_1: DepositToken
  let msdVaUSDC_1: DepositToken
  let msdVaETH_1: DepositToken
  let msdSfrxETH_1: DepositToken
  let msdVaSTETH_1: DepositToken
  let msdVaRETH_1: DepositToken
  let msdVaCBETH_1: DepositToken
  let msUSDDebt_1: DebtToken
  let msBTCDebt_1: DebtToken
  let msETHDebt_1: DebtToken
  let pool_2: Pool
  let smartFarmingManager_2: SmartFarmingManager
  let feeProvider_2: FeeProvider
  let treasury_2: Treasury
  let msdUSDC_2: DepositToken
  let msUSDDebt_2: DebtToken
  let msUSD: SyntheticToken
  let msBTC: SyntheticToken
  let msETH: SyntheticToken
  let msUSDProxyOFT: ProxyOFT
  let msETHProxyOFT: ProxyOFT

  async function fixture() {
    // Note: Using dynamic import otherwise test will fail when `/deployments/localhost` doesn't exist
    ;({address: POOL_REGISTRY_ADDRESS} = await import('../deployments/localhost/PoolRegistry.json'))
    ;({address: QUOTER_ADDRESS} = await import('../deployments/localhost/Quoter.json'))
    ;({address: CROSS_CHAIN_DISPATCHER_ADDRESS} = await import('../deployments/localhost/CrossChainDispatcher.json'))
    ;({address: MSUSD_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsUSDProxyOFT.json'))
    ;({address: MSETH_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsETHProxyOFT.json'))
    ;({address: MSUSD_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsUSDSynthetic.json'))
    ;({address: MSBTC_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsBTCSynthetic.json'))
    ;({address: MSETH_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsETHSynthetic.json'))
    ;({address: NATIVE_TOKEN_GATEWAY_ADDRESS} = await import('../deployments/localhost/NativeTokenGateway.json'))
    ;({address: SFM_POOL1_ADDRESS} = await import('../deployments/localhost/SmartFarmingManager_Pool1.json'))
    ;({address: FEE_PROVIDER_POOL1_ADDRESS} = await import('../deployments/localhost/FeeProvider_Pool1.json'))
    ;({address: TREASURY_POOL1_ADDRESS} = await import('../deployments/localhost/Treasury_Pool1.json'))
    ;({address: USDC_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/USDCDepositToken_Pool1.json'))
    ;({address: DAI_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/DAIDepositToken_Pool1.json'))
    ;({address: WBTC_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/WBTCDepositToken_Pool1.json'))
    ;({address: FRAX_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/FRAXDepositToken_Pool1.json'))
    ;({address: WETH_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/WETHDepositToken_Pool1.json'))
    ;({address: VAFRAX_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/VaFRAXDepositToken_Pool1.json'))
    ;({address: VAUSDC_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/VaUSDCDepositToken_Pool1.json'))
    ;({address: VAETH_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/VaETHDepositToken_Pool1.json'))
    ;({address: MSUSD_DEBT_POOL1_ADDRESS} = await import('../deployments/localhost/MsUSDDebt_Pool1.json'))
    ;({address: MSBTC_DEBT_POOL1_ADDRESS} = await import('../deployments/localhost/MsBTCDebt_Pool1.json'))
    ;({address: MSETH_DEBT_POOL1_ADDRESS} = await import('../deployments/localhost/MsETHDebt_Pool1.json'))
    ;({address: SRFXETH_DEPOSIT_POOL1_ADDRESS} = await import(
      '../deployments/localhost/SfrxETHDepositToken_Pool1.json'
    ))
    ;({address: VASTETH_DEPOSIT_POOL1_ADDRESS} = await import(
      '../deployments/localhost/VaSTETHDepositToken_Pool1.json'
    ))
    ;({address: VARETH_DEPOSIT_POOL1_ADDRESS} = await import('../deployments/localhost/VaRETHDepositToken_Pool1.json'))
    ;({address: VACBETH_DEPOSIT_POOL1_ADDRESS} = await import(
      '../deployments/localhost/VaCBETHDepositToken_Pool1.json'
    ))
    ;({address: SFM_POOL2_ADDRESS} = await import('../deployments/localhost/SmartFarmingManager_Pool2.json'))
    ;({address: FEE_PROVIDER_POOL2_ADDRESS} = await import('../deployments/localhost/FeeProvider_Pool2.json'))
    ;({address: TREASURY_POOL2_ADDRESS} = await import('../deployments/localhost/Treasury_Pool2.json'))
    ;({address: USDC_DEPOSIT_POOL2_ADDRESS} = await import('../deployments/localhost/USDCDepositToken_Pool2.json'))
    ;({address: MSUSD_DEBT_POOL2_ADDRESS} = await import('../deployments/localhost/MsUSDDebt_Pool2.json'))

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
    crossChainDispatcher = await ethers.getContractAt('CrossChainDispatcher', CROSS_CHAIN_DISPATCHER_ADDRESS, alice)
    quoter = await ethers.getContractAt('Quoter', QUOTER_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msBTC = await ethers.getContractAt('SyntheticToken', MSBTC_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
    msETHProxyOFT = await ethers.getContractAt('ProxyOFT', MSETH_PROXYOFT_ADDRESS, alice)

    const [pool1Address, pool2Address] = await poolRegistry.getPools()

    pool_1 = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)
    feeProvider_1 = await ethers.getContractAt('FeeProvider', FEE_PROVIDER_POOL1_ADDRESS, alice)
    treasury_1 = await ethers.getContractAt('Treasury', TREASURY_POOL1_ADDRESS, alice)
    smartFarmingManager_1 = await ethers.getContractAt('SmartFarmingManager', SFM_POOL1_ADDRESS, alice)
    msdUSDC_1 = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_POOL1_ADDRESS, alice) // 6 decimals.
    msdDAI_1 = await ethers.getContractAt('DepositToken', DAI_DEPOSIT_POOL1_ADDRESS, alice) // 18 decimals
    msdWBTC_1 = await ethers.getContractAt('DepositToken', WBTC_DEPOSIT_POOL1_ADDRESS, alice)
    msdFRAX_1 = await ethers.getContractAt('DepositToken', FRAX_DEPOSIT_POOL1_ADDRESS, alice)
    msdWETH_1 = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_POOL1_ADDRESS, alice)
    msdVaFRAX_1 = await ethers.getContractAt('DepositToken', VAFRAX_DEPOSIT_POOL1_ADDRESS, alice)
    msdVaUSDC_1 = await ethers.getContractAt('DepositToken', VAUSDC_DEPOSIT_POOL1_ADDRESS, alice)
    msdVaETH_1 = await ethers.getContractAt('DepositToken', VAETH_DEPOSIT_POOL1_ADDRESS, alice)
    msdSfrxETH_1 = await ethers.getContractAt('DepositToken', SRFXETH_DEPOSIT_POOL1_ADDRESS, alice)
    msdVaSTETH_1 = await ethers.getContractAt('DepositToken', VASTETH_DEPOSIT_POOL1_ADDRESS, alice)
    msdVaRETH_1 = await ethers.getContractAt('DepositToken', VARETH_DEPOSIT_POOL1_ADDRESS, alice)
    msdVaCBETH_1 = await ethers.getContractAt('DepositToken', VACBETH_DEPOSIT_POOL1_ADDRESS, alice)
    msUSDDebt_1 = await ethers.getContractAt('DebtToken', MSUSD_DEBT_POOL1_ADDRESS, alice)
    msBTCDebt_1 = await ethers.getContractAt('DebtToken', MSBTC_DEBT_POOL1_ADDRESS, alice)
    msETHDebt_1 = await ethers.getContractAt('DebtToken', MSETH_DEBT_POOL1_ADDRESS, alice)

    pool_2 = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool2Address, alice)
    feeProvider_2 = await ethers.getContractAt('FeeProvider', FEE_PROVIDER_POOL2_ADDRESS, alice)
    treasury_2 = await ethers.getContractAt('Treasury', TREASURY_POOL2_ADDRESS, alice)
    smartFarmingManager_2 = await ethers.getContractAt('SmartFarmingManager', SFM_POOL2_ADDRESS, alice)
    msdUSDC_2 = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_POOL2_ADDRESS, alice) // 6 decimals.
    msUSDDebt_2 = await ethers.getContractAt('DebtToken', MSUSD_DEBT_POOL2_ADDRESS, alice)

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

    await usdc.connect(alice).approve(msdUSDC_1.address, MaxUint256)
    await usdc.connect(alice).approve(msdUSDC_2.address, MaxUint256)
    await dai.connect(alice).approve(msdDAI_1.address, MaxUint256)
    await wbtc.connect(alice).approve(msdWBTC_1.address, MaxUint256)
    await frax.connect(alice).approve(msdFRAX_1.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH_1.address, MaxUint256)
    await vaFRAX.connect(alice).approve(msdVaFRAX_1.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC_1.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH_1.address, MaxUint256)
    await sfrxETH.connect(alice).approve(msdSfrxETH_1.address, MaxUint256)
    await vaSTETH.connect(alice).approve(msdVaSTETH_1.address, MaxUint256)
    await vaRETH.connect(alice).approve(msdVaRETH_1.address, MaxUint256)
    await vaCBETH.connect(alice).approve(msdVaCBETH_1.address, MaxUint256)

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
      expect(POOL_REGISTRY_ADDRESS).eq(await pool_1.poolRegistry())
      expect(CROSS_CHAIN_DISPATCHER_ADDRESS).eq(await poolRegistry.crossChainDispatcher())
      expect(QUOTER_ADDRESS).eq(await poolRegistry.quoter())

      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSETH_SYNTHETIC_ADDRESS).eq(await msETHProxyOFT.token())
      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
      expect(MSETH_PROXYOFT_ADDRESS).eq(await msETH.proxyOFT())

      expect(await pool_1.smartFarmingManager()).eq(smartFarmingManager_1.address)
      expect(await pool_1.treasury()).eq(treasury_1.address)
      expect(await pool_1.feeProvider()).eq(feeProvider_1.address)
      expect(await smartFarmingManager_1.pool()).eq(pool_1.address)
      expect(await treasury_1.pool()).eq(pool_1.address)

      expect(USDC_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(usdc.address))
      expect(DAI_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(dai.address))
      expect(WBTC_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(wbtc.address))
      expect(FRAX_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(frax.address))
      expect(WETH_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(weth.address))
      expect(VAETH_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(vaETH.address))
      expect(VAFRAX_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(vaFRAX.address))
      expect(VAUSDC_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(vaUSDC.address))
      expect(SRFXETH_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(sfrxETH.address))
      expect(VASTETH_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(vaSTETH.address))
      expect(VARETH_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(vaRETH.address))
      expect(VACBETH_DEPOSIT_POOL1_ADDRESS).eq(await pool_1.depositTokenOf(vaCBETH.address))
      expect(MSUSD_DEBT_POOL1_ADDRESS).eq(await pool_1.debtTokenOf(msUSD.address))
      expect(MSBTC_DEBT_POOL1_ADDRESS).eq(await pool_1.debtTokenOf(msBTC.address))
      expect(MSETH_DEBT_POOL1_ADDRESS).eq(await pool_1.debtTokenOf(msETH.address))

      expect(await pool_2.smartFarmingManager()).eq(smartFarmingManager_2.address)
      expect(await pool_2.treasury()).eq(treasury_2.address)
      expect(await pool_2.feeProvider()).eq(feeProvider_2.address)
      expect(await smartFarmingManager_2.pool()).eq(pool_2.address)
      expect(await treasury_2.pool()).eq(pool_2.address)
      expect(USDC_DEPOSIT_POOL2_ADDRESS).eq(await pool_2.depositTokenOf(usdc.address))
      expect(MSUSD_DEBT_POOL2_ADDRESS).eq(await pool_2.debtTokenOf(msUSD.address))
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
      const tx = () => msdUSDC_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDC_1, alice, amount)
    })

    it('should deposit DAI', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdDAI_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdDAI_1, alice, amount)
    })

    it('should deposit FRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdFRAX_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdFRAX_1, alice, amount)
    })

    it('should deposit WBTC', async function () {
      // given
      const amount = parseUnits('1', 8)

      // when
      const tx = () => msdWBTC_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWBTC_1, alice, amount)
    })

    it('should deposit WETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdWETH_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWETH_1, alice, amount)
    })

    it('should deposit WETH using ETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => nativeGateway.deposit(pool_1.address, {value: amount})

      // then
      await expect(tx).changeTokenBalance(msdWETH_1, alice, amount)
    })

    it('should deposit vaFRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaFRAX_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaFRAX_1, alice, amount)
    })

    it('should deposit vaUSDC', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaUSDC_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaUSDC_1, alice, amount)
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
      const before = await msdVaUSDC_1.balanceOf(alice.address)
      expect(before).eq(0)

      // when
      await usdc.approve(vesperGateway.address, amount6)
      await vesperGateway.deposit(pool_1.address, vaUSDC.address, amount6)

      // then
      const after = await msdVaUSDC_1.balanceOf(alice.address)
      expect(after).closeTo(parseUnits('0.86', 18), parseUnits('0.01', 18))
    })

    it('should deposit vaETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaETH_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaETH_1, alice, amount)
    })

    it('should deposit sfrxETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdSfrxETH_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdSfrxETH_1, alice, amount)
    })

    it('should deposit vaSTETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaSTETH_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaSTETH_1, alice, amount)
    })

    it('should deposit vaRETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaRETH_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaRETH_1, alice, amount)
    })

    it('should deposit vaCBETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaCBETH_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaCBETH_1, alice, amount)
    })

    it('should issue msUSD', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 6)
      const tx = () => msUSDDebt_1.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msUSD, alice, amount)
    })

    it('should issue msBTC', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 8)
      const tx = () => msBTCDebt_1.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msBTC, alice, amount)
    })

    it('should issue msETH', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('10,000', await usdc.decimals()), alice.address)

      // when
      const amount = parseEther('1')
      const tx = () => msETHDebt_1.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msETH, alice, amount)
    })

    it('should increase debt by the time', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('500', await usdc.decimals()), alice.address)
      await msUSDDebt_1.issue(parseEther('100'), alice.address)
      const debtBefore = await msUSDDebt_1.balanceOf(alice.address)

      // when
      const interestRate = parseEther('0.02') // 2%
      await msUSDDebt_1.connect(governor).updateInterestRate(interestRate)
      await time.increase(time.duration.years(1))
      await msUSDDebt_1.accrueInterest()

      // then
      const expectedDebt = debtBefore.mul(parseEther('1').add(interestRate)).div(parseEther('1'))
      expect(await pool_1.debtOf(alice.address)).closeTo(expectedDebt, parseEther('0.01'))
    })

    it('should liquidate unhealthy position', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('400', await usdc.decimals()), alice.address)
      await msUSDDebt_1.connect(governor).updateInterestRate(parseEther('0')) // 0%
      const {_issuableInUsd} = await pool_1.debtPositionOf(alice.address)
      await msUSDDebt_1.issue(_issuableInUsd, alice.address)
      await msUSDDebt_1.connect(governor).updateInterestRate(parseEther('0.5')) // 50%
      await time.increase(time.duration.minutes(10))
      await msUSDDebt_1.accrueInterest()
      expect((await pool_1.debtPositionOf(alice.address))._isHealthy).false

      // when
      await msdUSDC_1.deposit(parseUnits('400', await usdc.decimals()), bob.address)
      await msUSDDebt_1.connect(bob).issue(parseEther('100'), bob.address)
      const amountToRepay = parseEther('50') // repay all user's debt
      const tx = await pool_1.connect(bob).liquidate(msUSD.address, alice.address, amountToRepay, msdUSDC_1.address)

      // then
      await expect(tx).emit(pool_1, 'PositionLiquidated')
    })

    it('should swap', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt_1.issue(parseEther('1'), alice.address)
      const debtBefore = await pool_1.debtOf(alice.address)
      expect(await msUSD.balanceOf(alice.address)).gt(0)
      expect(await msETH.balanceOf(alice.address)).eq(0)

      // when
      await pool_1.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // then
      expect(await msUSD.balanceOf(alice.address)).eq(0)
      expect(await msETH.balanceOf(alice.address)).gt(0)
      const debtsAfter = await pool_1.debtOf(alice.address)
      expect(debtsAfter).closeTo(debtBefore, parseEther('0.0001'))
    })

    it('should repay', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt_1.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt_1.issue(debtToIssue, alice.address)
      const msUSDDebtBalance = await msUSDDebt_1.balanceOf(alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool_1.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)

      // when
      const debtToRepay = parseEther('0.5')
      const repayFee = parseEther('0')
      const debtPlusRepayFee = debtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
      await msUSDDebt_1.repay(alice.address, debtPlusRepayFee)

      // then
      expect(await msUSDDebt_1.balanceOf(alice.address)).lt(msUSDDebtBalance)
    })

    it('should revert if repaying using wrong synthetic asset', async function () {
      // given
      await msdUSDC_1.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt_1.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt_1.issue(debtToIssue, alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool_1.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)
      await pool_1.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // when
      const tx = msUSDDebt_1.repay(alice.address, 10) // pay 10 wei

      // then
      await expect(tx).revertedWithCustomError(msUSDDebt_1, 'BurnAmountExceedsBalance')
    })

    it('should withdraw', async function () {
      await msdUSDC_1.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt_1.issue(parseEther('1'), alice.address)

      // when
      const amount = await msdUSDC_1.unlockedBalanceOf(alice.address)
      await msdUSDC_1.withdraw(amount, alice.address)

      // then
      const {_depositInUsd: depositAfter} = await pool_1.depositOf(alice.address)
      expect(depositAfter).closeTo(0, dust)
    })

    describe('leverage', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
      })

      it('should leverage vaUSDC->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        const tx = await smartFarmingManager_1.leverage(
          vaUSDC.address,
          msdVaUSDC_1.address,
          msUSD.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(parseEther('172'), parseEther('10'))
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
      })

      it('should leverage vaFRAX->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaFRAX.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        const tx = await smartFarmingManager_1.leverage(
          vaFRAX.address,
          msdVaFRAX_1.address,
          msUSD.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(parseEther('178'), parseEther('10'))
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
      })

      it('should leverage vaETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('310', 18) // approx.
        const leverage = parseEther('1.5')
        await vaETH.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        const tx = await smartFarmingManager_1.leverage(
          vaETH.address,
          msdVaETH_1.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$285
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$95
      })

      it('should leverage varETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('340', 18) // approx.
        const leverage = parseEther('1.5')
        await vaRETH.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        const tx = await smartFarmingManager_1.leverage(
          vaRETH.address,
          msdVaRETH_1.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$292
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$97
      })

      it('should leverage vastETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('305', 18) // approx.
        const leverage = parseEther('1.5')
        await vaSTETH.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        const tx = await smartFarmingManager_1.leverage(
          vaSTETH.address,
          msdVaSTETH_1.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$292
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$97
      })

      it('should leverage vacbETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = parseUnits('330', 18) // approx.
        const leverage = parseEther('1.5')
        await vaCBETH.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        const tx = await smartFarmingManager_1.leverage(
          vaCBETH.address,
          msdVaCBETH_1.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100')) // ~$285
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        ) // ~$95
      })
    })

    describe('flashRepay', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        await smartFarmingManager_1.leverage(vaUSDC.address, msdVaUSDC_1.address, msUSD.address, amountIn, leverage, 0)
      })

      it('should flash repay msUSD debt using vaUSDC', async function () {
        // when
        const withdrawAmount = parseEther('45')
        const tx = await smartFarmingManager_1.flashRepay(msUSD.address, msdVaUSDC_1.address, withdrawAmount, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1e6))
        const {_debtInUsd} = await pool_1.debtPositionOf(alice.address)
        expect(_debtInUsd).closeTo(0, parseEther('10'))
      })
    })

    describe('cross-chain operations', function () {
      const LZ_OPTIMISM_ID = 111

      beforeEach(async function () {
        if (!(await crossChainDispatcher.isBridgingActive())) {
          await crossChainDispatcher.connect(governor).toggleBridgingIsActive()
        }

        if (!(await pool_1.isBridgingActive())) {
          await pool_1.connect(governor).toggleBridgingIsActive()
        }
      })

      it('crossChainLeverages', async function () {
        // when
        const id = '92458281274488595289803937127152923398167637295201432141969818930235769911599'

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
          tokenIn,
        } = await smartFarmingManager_1.crossChainLeverages(id)

        // then
        expect(dstChainId).eq(LZ_OPTIMISM_ID)
        expect(bridgeToken).eq(usdc.address)
        expect(depositToken).eq(msdVaUSDC_1.address)
        expect(syntheticToken).eq(msUSD.address)
        expect(amountIn).eq('10000000')
        expect(debtAmount).eq('10001755800000000000')
        expect(depositAmountMin).eq(1)
        expect(account).eq('0xdf826ff6518e609E4cEE86299d40611C148099d5')
        expect(finished).eq(true)
        expect(tokenIn).eq(ethers.constants.AddressZero)
      })

      it('crossChainLeverage', async function () {
        // given
        const idBefore = await smartFarmingManager_1.crossChainRequestsLength()

        // when
        const amountIn = parseUnits('100', 6)
        const leverage = parseEther('1.5')
        const swapAmountOutMin = 0
        const depositAmountOutMin = 0
        // Note: This call must be called from the OP chain
        // const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
        // Using hard-coded values to make test pass
        const lzArgs = CrossChainLib.encodeLzArgs(LZ_OPTIMISM_ID, parseEther('0.1'), '750000')

        const fee = parseEther('0.5')
        await usdc.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
        await smartFarmingManager_1[
          'crossChainLeverage(address,address,address,address,uint256,uint256,uint256,uint256,bytes)'
        ](
          usdc.address,
          msUSD.address,
          usdc.address,
          msdVaUSDC_1.address,
          amountIn,
          leverage,
          swapAmountOutMin,
          depositAmountOutMin,
          lzArgs,
          {value: fee}
        )

        // then
        expect(await smartFarmingManager_1.crossChainRequestsLength()).eq(idBefore.add(1))
      })

      describe('crossChainFlashRepay', function () {
        beforeEach(async function () {
          const {_debtInUsd, _depositInUsd} = await pool_1.debtPositionOf(alice.address)
          expect(_debtInUsd).eq(0)
          expect(_depositInUsd).eq(0)
          const amountIn = parseUnits('100', 18)
          const leverage = parseEther('1.5')
          await vaUSDC.connect(alice).approve(smartFarmingManager_1.address, MaxUint256)
          await smartFarmingManager_1.leverage(
            vaUSDC.address,
            msdVaUSDC_1.address,
            msUSD.address,
            amountIn,
            leverage,
            0
          )
        })

        it('crossChainFlashRepays', async function () {
          // when
          const id = '9247535584797915451057180664748820695544591120644449140157971996739901653371'

          const {dstChainId, syntheticToken, repayAmountMin, account, finished} =
            await smartFarmingManager_1.crossChainFlashRepays(id)

          // then
          expect(dstChainId).eq(LZ_OPTIMISM_ID)
          expect(syntheticToken).eq(msETH.address)
          expect(repayAmountMin).eq(0)
          expect(account).eq('0xdf826ff6518e609E4cEE86299d40611C148099d5')
          expect(finished).eq(true)
        })

        it('crossChainFlashRepay', async function () {
          // given
          const idBefore = await smartFarmingManager_1.crossChainRequestsLength()

          // when
          const withdrawAmount = parseUnits('30', 18)
          const underlyingAmountOutMin = 0
          const swapAmountOutMin = 0
          const repayAmountOutMin = 0
          // Note: This call must be called from the OP chain
          // const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_MAINNET_ID, LZ_OP_ID)
          // Using hard-coded values to make test pass
          const lzArgs = CrossChainLib.encodeLzArgs(LZ_OPTIMISM_ID, parseEther('0.1'), '750000')

          const fee = parseEther('0.5')

          await smartFarmingManager_1.crossChainFlashRepay(
            msUSD.address,
            msdVaUSDC_1.address,
            withdrawAmount,
            usdc.address,
            underlyingAmountOutMin,
            swapAmountOutMin,
            repayAmountOutMin,
            lzArgs,
            {value: fee}
          )

          // then
          expect(await smartFarmingManager_1.crossChainRequestsLength()).eq(idBefore.add(1))
        })
      })
    })
  })
})
