/* eslint-disable camelcase */
/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {BigNumber, Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, setCode, time} from '@nomicfoundation/hardhat-network-helpers'
import {EvmPriceServiceConnection} from '@pythnetwork/pyth-evm-js'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {impersonateAccount, setTokenBalance, disableForking, enableForking} from './helpers'
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
  ProxyOFT,
  FeeProvider,
  Treasury,
  AMO,
  Operator,
  IOperator,
} from '../typechain'
import Constants from '../helpers/constants'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/mainnet/PoolRegistry.json'
import {address as MSUSD_PROXYOFT_ADDRESS} from '../deployments/mainnet/MsUSDProxyOFT.json'
import {address as MSETH_PROXYOFT_ADDRESS} from '../deployments/mainnet/MsETHProxyOFT.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsUSDSynthetic.json'
import {address as MSBTC_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsBTCSynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsETHSynthetic.json'
import {address as AMO_ADDRESS} from '../deployments/mainnet/AMO.json'
import {address as OPERATOR_ADDRESS} from '../deployments/mainnet/Operator.json'
import {address as SFM_POOL1_ADDRESS} from '../deployments/mainnet/SmartFarmingManager_Pool1.json'
import {address as FEE_PROVIDER_POOL1_ADDRESS} from '../deployments/mainnet/FeeProvider_Pool1.json'
import {address as TREASURY_POOL1_ADDRESS} from '../deployments/mainnet/Treasury_Pool1.json'
import {address as USDC_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/USDCDepositToken_Pool1.json'
import {address as DAI_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/DAIDepositToken_Pool1.json'
import {address as WBTC_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/WBTCDepositToken_Pool1.json'
import {address as FRAX_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/FRAXDepositToken_Pool1.json'
import {address as WETH_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/WETHDepositToken_Pool1.json'
import {address as VAFRAX_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/VaFRAXDepositToken_Pool1.json'
import {address as VAUSDC_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/VaUSDCDepositToken_Pool1.json'
import {address as VAETH_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/VaETHDepositToken_Pool1.json'
import {address as SRFXETH_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/SfrxETHDepositToken_Pool1.json'
import {address as VASTETH_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/VaSTETHDepositToken_Pool1.json'
import {address as VARETH_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/VaRETHDepositToken_Pool1.json'
import {address as VACBETH_DEPOSIT_POOL1_ADDRESS} from '../deployments/mainnet/VaCBETHDepositToken_Pool1.json'
import {address as MSUSD_DEBT_POOL1_ADDRESS} from '../deployments/mainnet/MsUSDDebt_Pool1.json'
import {address as MSBTC_DEBT_POOL1_ADDRESS} from '../deployments/mainnet/MsBTCDebt_Pool1.json'
import {address as MSETH_DEBT_POOL1_ADDRESS} from '../deployments/mainnet/MsETHDebt_Pool1.json'
import {address as SFM_POOL2_ADDRESS} from '../deployments/mainnet/SmartFarmingManager_Pool2.json'
import {address as FEE_PROVIDER_POOL2_ADDRESS} from '../deployments/mainnet/FeeProvider_Pool2.json'
import {address as TREASURY_POOL2_ADDRESS} from '../deployments/mainnet/Treasury_Pool2.json'
import {address as USDC_DEPOSIT_POOL2_ADDRESS} from '../deployments/mainnet/USDCDepositToken_Pool2.json'
import {address as MSUSD_DEBT_POOL2_ADDRESS} from '../deployments/mainnet/MsUSDDebt_Pool2.json'

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * The goal of this test suite is to test current state of the mainnet's contracts
 * Note: When we have on-going changes the TypesChain types may be different than the deployed contracts
 * For these cases, use `new ethers.Contract()` instead and amend ABI manually
 */
describe('E2E tests (@mainnet)', function () {
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
  let amo: AMO
  let operator: Operator

  if (isNodeHardhat) {
    before(async function () {
      await enableForking('mainnet')
    })

    after(disableForking)
  }

  async function fixture() {
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
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', await poolRegistry.nativeTokenGateway(), alice)
    amo = await ethers.getContractAt('AMO', AMO_ADDRESS, alice)
    operator = await ethers.getContractAt('Operator', OPERATOR_ADDRESS, alice)

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
      [
        'function defaultOracle() view returns(address)',
        'function getPriceInUsd(address) view returns(uint256)',
        'function quote(address,address,uint256) view returns(uint256)',
        'function updateDefaultOracle(address)',
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

    // These well-known accounts have delegated code which reverts when receiving ETH
    await setCode(alice.address, '0x00')
    await setCode(bob.address, '0x00')
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)

    if (process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool_1.poolRegistry())

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

    // TODO(upgrade): confirm still applicable post-upgrade. Not carried into `E2E.mainnet.next.test.ts`; kept skipped for triage.
    it.skip('should deposit FRAX', async function () {
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
      expect(after).closeTo(parseUnits('0.77', 18), parseUnits('0.05', 18))
    })

    // TODO(upgrade): confirm still applicable post-upgrade. Not carried into `E2E.mainnet.next.test.ts`; kept skipped for triage.
    it.skip('should deposit vaFRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaFRAX_1.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaFRAX_1, alice, amount)
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
      if (!(await msUSDDebt_1.interestRate()).eq(interestRate)) {
        await msUSDDebt_1.connect(governor).updateInterestRate(interestRate)
      }
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
        expect(_depositInUsd).closeTo(parseEther('193'), parseEther('10'))
        expect(_debtInUsd).closeTo(parseEther('65'), parseEther('5')) // ~$50
      })

      // TODO(upgrade): confirm still applicable post-upgrade. Not carried into `E2E.mainnet.next.test.ts`; kept skipped for triage.
      it.skip('should leverage vaFRAX->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const amountInUsd = await masterOracle.quote(vaFRAX.address, msUSD.address, amountIn)
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
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('10'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('10')
        )
      })

      it('should leverage vaETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaETH.address, msUSD.address, amountIn)
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
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
      })

      it('should leverage varETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaRETH.address, msUSD.address, amountIn)
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
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
      })

      it('should leverage vastETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaSTETH.address, msUSD.address, amountIn)
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
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
      })

      it('should leverage vacbETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaCBETH.address, msUSD.address, amountIn)
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
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
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

    describe('amo', function () {
      it('should have correct parameters', async function () {
        expect(await amo.poolRegistry()).eq(poolRegistry.address)
        expect(await msUSD.amo()).eq(amo.address)
        expect(await msETH.amo()).eq(amo.address)
        expect(await msUSD.maxAmoSupply()).gt(0)
        expect(await msETH.maxAmoSupply()).gt(0)
      })
    })

    // TODO(upgrade): confirm still applicable post-upgrade. The vesper-strategy AMO flow exists in the pre-upgrade
    // suite but was not carried into `E2E.mainnet.next.test.ts`; kept skipped for triage.
    describe.skip('amo (vesper strategy)', function () {
      let vamsETH: Contract
      let morphoStrategy: Contract
      let keeper: SignerWithAddress

      beforeEach(async function () {
        vamsETH = await ethers.getContractAt(
          [
            'function tokensHere() view returns (uint256)',
            'function getStrategies() view returns (address[] memory)',
            'function poolAccountant() view returns(address)',
            'function governor() view returns(address)',
          ],
          Address.VAMSETH_ADDRESS,
          alice
        )

        const vesperGovernor = await impersonateAccount(await vamsETH.governor())

        const poolAccountantAddress = await vamsETH.poolAccountant()

        const vamsETHPoolAccountant = await ethers.getContractAt(
          ['function updateDebtRatio(address,uint256)'],
          poolAccountantAddress,
          alice
        )

        const [morphoStrategyAddress] = await vamsETH.getStrategies()

        await vamsETHPoolAccountant.connect(vesperGovernor).updateDebtRatio(morphoStrategyAddress, 10000)

        morphoStrategy = await ethers.getContractAt(
          [
            'function rebalance()',
            'function keepers() view returns(address[] memory)',
            'function tvl() view returns(uint256)',
          ],
          morphoStrategyAddress,
          alice
        )

        const [keeperAddress] = await morphoStrategy.keepers()
        keeper = await impersonateAccount(keeperAddress)

        await amo.connect(governor).updateVesperPool(msETH.address, vamsETH.address)
      })

      it('should mint synths and deposit to vesper', async function () {
        // given
        expect(await vamsETH.tokensHere()).eq(0)
        expect(await morphoStrategy.tvl()).eq(0)
        expect(await msETH.amoSupply()).eq(0)
        const amount = parseEther('1')
        await amo.connect(governor).mintAndDeposit(msETH.address, vamsETH.address, amount)
        expect(await vamsETH.tokensHere()).eq(amount)
        expect(await msETH.amoSupply()).eq(amount)

        // when
        await morphoStrategy.connect(keeper).rebalance()

        // then
        expect(await vamsETH.tokensHere()).eq(0)
        expect(await morphoStrategy.tvl()).eq(amount)
      })

      describe('when has synth deposited to vesper ', function () {
        const amount = parseEther('1')

        beforeEach(async function () {
          await amo.connect(governor).mintAndDeposit(msETH.address, vamsETH.address, amount)
          await morphoStrategy.connect(keeper).rebalance()
          expect(await morphoStrategy.tvl()).eq(amount)
          expect(await msETH.amoSupply()).eq(amount)
        })

        it('should withdraw synths from vesper and burn them', async function () {
          // when
          await amo.connect(governor).withdrawAndBurn(msETH.address, vamsETH.address, amount)

          // then
          expect(await vamsETH.tokensHere()).eq(0)
          expect(await morphoStrategy.tvl()).eq(0)
          expect(await msETH.amoSupply()).eq(0)
        })

        it('should harvest yield', async function () {
          // given
          const profit = parseEther('0.25')
          const poolWallet = await impersonateAccount(pool_1.address)
          await msETH.connect(poolWallet).mint(vamsETH.address, profit)

          // when
          const tx = amo.connect(governor).harvest(msETH.address, vamsETH.address)

          // then
          await expect(tx).changeTokenBalance(msETH, governor.address, profit)
          expect(await morphoStrategy.tvl()).eq(amount)
          expect(await msETH.amoSupply()).eq(amount)
        })
      })
    })

    describe('operator', function () {
      it.skip('should deposit using operator', async function () {
        // given
        const amount = parseUnits('1', 6)

        // when
        const calls: IOperator.CallStruct[] = [
          {
            target: msdUSDC_1.address,
            value: 0,
            callData: msdUSDC_1.interface.encodeFunctionData('deposit', [amount, alice.address]),
          },
        ]
        const tx = () => operator.connect(alice).execute(calls)

        // then
        await expect(tx).changeTokenBalance(msdUSDC_1, alice, amount)
      })
    })

    describe.skip('pull-oracles', function () {
      // Addresses
      const PYTH_PROTOCOL = '0x4305fb66699c3b2702d4d05cf36551390a4c69c6'
      const PYTH_PROVIDER = '0x7c2d5b1E7d7BE588389BDb94138cC37dC014e85c'
      const PYTH_ORACLE = '0x1f278B7EFf04ADd48Ff81ae1a01cBC178b3dD351'

      // Contracts
      let pyth: Contract
      let pythProvider: Contract
      let pullOracle: Contract

      // Feeds
      const pythFeedIds = [
        '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a', // USDC
        '0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd', // DAI
        '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // WETH,msETH
        '0xc3d5d8d6d17081b3d0bbca6e2fa3a6704bb9a9561d9f9e1dc52db47629f862ad', // FRAX
        '0xb2bb466ff5386a63c18aa7c3bc953cb540c755e2aa99dafb13bc4c177692bed0', // sfrxETH
        '0xa0255134973f4fdf2f8f7808354274a3b1ebc6ee438be898d045e8b56ba1fe13', // rETH
        '0x846ae1bdb6300b817cee5fdee2a6da192775030db5615b94a465f53bd40850b5', // stETH
        '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // WBTC,msBTC
        '0x15ecddd26d49e1a8f1de9376ebebc03916ede873447c1255d2d5891b92ce5717', // cbETH
      ]
      const pythAPI = new EvmPriceServiceConnection('https://hermes.pyth.network')

      beforeEach(async function () {
        // Initialize contracts
        const pythABI = [
          'function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount)',
          'function updatePriceFeeds(bytes[] calldata updateData) external payable',
        ]
        const providerABI = [
          'function getPriceInUsd(address token_) external view returns (uint256 _priceInUsd, uint256 _lastUpdatedAt)',
        ]
        const oracleABI = ['function getPriceInUsd(address) view returns (uint256 _priceInUsd)']

        pyth = await ethers.getContractAt(pythABI, PYTH_PROTOCOL, alice)
        pythProvider = await ethers.getContractAt(providerABI, PYTH_PROVIDER, alice)
        pullOracle = await ethers.getContractAt(oracleABI, PYTH_ORACLE, alice)

        // Setup
        // Change block time to current timestamp (otherwise queries will throw 'price-too-ahead')
        const currentTimestamp = parseInt((Date.now() / 1000).toFixed())
        const blockTimestamp = await time.latest()
        const toIncrease = currentTimestamp - blockTimestamp
        await time.increase(toIncrease)
      })

      describe('when pull oracle prices are updated', function () {
        beforeEach(async function () {
          // Update all feeds
          const priceUpdate = await pythAPI.getPriceFeedsUpdateData(pythFeedIds)
          const fee = await pyth.getUpdateFee(pythFeedIds)
          await pyth.updatePriceFeeds(priceUpdate, {value: fee})
        })

        it('should get prices from provider', async function () {
          const {_priceInUsd: pythPrice} = await pythProvider.getPriceInUsd(Address.WETH_ADDRESS)
          expect(pythPrice).gt(0)
        })

        it('should get prices from oracle', async function () {
          // given
          const {_priceInUsd: pythPrice} = await pythProvider.getPriceInUsd(Address.CBETH_ADDRESS)
          expect(pythPrice).gt(0)

          // when
          const oraclePrice = await pullOracle.getPriceInUsd(Address.CBETH_ADDRESS)
          expect(oraclePrice).eq(pythPrice)
        })
      })

      describe('when pull-oracle is the default oracle', function () {
        beforeEach(async function () {
          await masterOracle.updateDefaultOracle(pullOracle.address)
          await masterOracle.updateTokenOracle(Address.STETH_ADDRESS, ethers.constants.AddressZero)
          await masterOracle.updateTokenOracle(Address.RETH_ADDRESS, ethers.constants.AddressZero)
          await masterOracle.updateTokenOracle(Address.CBETH_ADDRESS, ethers.constants.AddressZero)
        })

        describe('when pull oracle prices are updated', function () {
          beforeEach(async function () {
            // Update all feeds
            const priceUpdate = await pythAPI.getPriceFeedsUpdateData(pythFeedIds)
            const fee = await pyth.getUpdateFee(pythFeedIds)
            await pyth.updatePriceFeeds(priceUpdate, {value: fee})
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

        describe('when pull oracle prices are outdated', function () {
          it('should interact with synth protocol', async function () {
            // given
            await expect(masterOracle.getPriceInUsd(usdc.address)).revertedWith('price-too-behind')

            // when
            const priceUpdate = await pythAPI.getPriceFeedsUpdateData(pythFeedIds)
            const fee = await pyth.getUpdateFee(pythFeedIds)

            const amount = parseUnits('100', 6)
            const calls: IOperator.CallStruct[] = [
              {
                target: pyth.address,
                value: fee,
                callData: pyth.interface.encodeFunctionData('updatePriceFeeds', [priceUpdate]),
              },
              {
                target: msdUSDC_1.address,
                value: 0,
                callData: msdUSDC_1.interface.encodeFunctionData('deposit', [amount, alice.address]),
              },
            ]
            const tx = () => operator.connect(alice).execute(calls, {value: fee})

            // then
            await expect(tx).changeTokenBalance(msdUSDC_1, alice, amount)
          })
        })
      })
    })

    describe('cross-chain operations', function () {
      // Destination chains this deployment supports. See `deploy/scripts/mainnet/01_pool_registry.ts`.
      const supportedDstChainIds = [
        Constants.LZ_OP_CHAIN_ID,
        Constants.LZ_BASE_CHAIN_ID,
        Constants.LZ_PLASMA_CHAIN_ID,
        Constants.LZ_HEMI_CHAIN_ID,
      ]

      // One entry per bridgeable synth. Expected caps mirror the deploy scripts:
      // `deploy/scripts/mainnet/06_msusd_proxy_oft.ts` and `07_mseth_proxy_oft.ts`.
      const bridgeCases = [
        {
          name: 'msUSD',
          oft: () => msUSDProxyOFT,
          synth: () => msUSD,
          debt: () => msUSDDebt_1,
          amount: parseEther('10'),
          dstChainId: Constants.LZ_OP_CHAIN_ID,
          expectedMaxBridgedInSupply: parseEther('10000000'),
          expectedMaxBridgedOutSupply: parseEther('40000000'),
        },
        {
          name: 'msETH',
          oft: () => msETHProxyOFT,
          synth: () => msETH,
          debt: () => msETHDebt_1,
          amount: parseEther('0.1'),
          dstChainId: Constants.LZ_OP_CHAIN_ID,
          expectedMaxBridgedInSupply: parseEther('4500'),
          expectedMaxBridgedOutSupply: parseEther('4500'),
        },
      ]

      // Deposit collateral and issue `amount` of the synth to alice so she has something to bridge.
      async function issueSynth(debt: DebtToken, amount: BigNumber) {
        await msdWETH_1.deposit(parseEther('1'), alice.address)
        await debt.issue(amount, alice.address)
      }

      bridgeCases.forEach((c) => {
        describe(c.name, function () {
          it('should have the proxyOFT wired to the synthetic token', async function () {
            expect(await c.oft().token()).eq(c.synth().address)
            expect(await c.synth().proxyOFT()).eq(c.oft().address)
            expect(await c.oft().owner()).eq(await poolRegistry.governor())
          })

          it('should have bridging enabled to all supported chains', async function () {
            expect(await poolRegistry.isBridgingActive()).true
            expect(await poolRegistry.lzBaseGasLimit()).gt(0)
            for (const dstChainId of supportedDstChainIds) {
              expect(await poolRegistry.isDestinationChainSupported(dstChainId), `dst ${dstChainId}`).true
              expect(await c.oft().getProxyOFTOf(dstChainId), `remote ${dstChainId}`).not.eq(
                ethers.constants.AddressZero
              )
            }
          })

          it('should have the expected bridging supply caps', async function () {
            expect(await c.synth().maxBridgedInSupply()).eq(c.expectedMaxBridgedInSupply)
            expect(await c.synth().maxBridgedOutSupply()).eq(c.expectedMaxBridgedOutSupply)
          })

          it('should estimate a non-zero bridging fee', async function () {
            expect(await c.oft()['estimateSendFee(uint16,address,uint256)'](c.dstChainId, alice.address, c.amount)).gt(
              0
            )
          })

          it('should burn and account for the synth when bridging out', async function () {
            await issueSynth(c.debt(), c.amount)
            const totalSupplyBefore = await c.synth().totalSupply()
            const bridgedOutBefore = await c.synth().totalBridgedOut()

            const tx = () =>
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })

            await expect(tx).changeTokenBalance(c.synth(), alice, c.amount.mul(-1))
            expect(await c.synth().totalSupply()).eq(totalSupplyBefore.sub(c.amount))
            expect(await c.synth().totalBridgedOut()).eq(bridgedOutBefore.add(c.amount))
          })

          it('should revert when bridging is paused', async function () {
            await issueSynth(c.debt(), c.amount)
            await poolRegistry.connect(governor).toggleBridgingIsActive()

            await expect(
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })
            ).revertedWithCustomError(c.oft(), 'BridgingIsPaused')
          })

          it('should revert when the destination chain is not supported', async function () {
            await issueSynth(c.debt(), c.amount)
            await poolRegistry.connect(governor).toggleDestinationChainIsActive(c.dstChainId)

            await expect(
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })
            ).revertedWithCustomError(c.oft(), 'DestinationChainNotAllowed')
          })

          it('should revert when the caller does not own the funds', async function () {
            await issueSynth(c.debt(), c.amount)

            await expect(
              c.oft()['sendFrom(address,uint16,address,uint256)'](bob.address, c.dstChainId, alice.address, c.amount, {
                value: parseEther('0.5'),
              })
            ).revertedWithCustomError(c.oft(), 'SenderIsNotTheOwner')
          })

          it('should revert when using the disabled sendAndCall path', async function () {
            const toAddress = ethers.utils.solidityPack(['address'], [alice.address])

            await expect(
              c
                .oft()
                .sendAndCall(
                  alice.address,
                  c.dstChainId,
                  toAddress,
                  c.amount,
                  '0x',
                  0,
                  alice.address,
                  ethers.constants.AddressZero,
                  '0x',
                  {value: parseEther('0.5')}
                )
            ).revertedWithCustomError(c.oft(), 'SendAndCallNotAllowed')
          })

          it('should revert when the bridged-out supply cap is surpassed', async function () {
            await issueSynth(c.debt(), c.amount)
            const bridgedIn = await c.synth().totalBridgedIn()
            const bridgedOut = await c.synth().totalBridgedOut()
            const outSupplyNow = await c.synth().bridgedOutSupply()
            // Net out-supply after the burn, computed exactly as `SyntheticToken._burn` does.
            const outSupplyAfter = bridgedOut.add(c.amount).gt(bridgedIn)
              ? bridgedOut.add(c.amount).sub(bridgedIn)
              : ethers.constants.Zero

            // Only reachable when the bridge-out raises the net out-supply. If the fork is deeply
            // net-in for this synth a small bridge-out cannot exceed the out cap, so skip.
            if (!outSupplyAfter.gt(outSupplyNow)) {
              this.skip()
            }

            // Pin the cap at the current out-supply so the next burn surpasses it by `amount`.
            await c.synth().connect(governor).updateMaxBridgedOutSupply(outSupplyNow)

            await expect(
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })
            ).revertedWithCustomError(c.synth(), 'SurpassMaxBridgingSupply')
          })
        })
      })
    })
  })
})
