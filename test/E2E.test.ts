/* eslint-disable new-cap */
/* eslint-disable max-len */
/* eslint-disable camelcase */
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
  IRoutedSwapper__factory,
  TransparentUpgradeableProxy__factory,
  FeeProvider__factory,
  VesperGateway__factory,
} from '../typechain'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/mainnet/PoolRegistry.json'
import {address as USDC_DEPOSIT_ADDRESS} from '../deployments/mainnet/USDCDepositToken.json'
import {address as DAI_DEPOSIT_ADDRESS} from '../deployments/mainnet/DAIDepositToken.json'
import {address as WBTC_DEPOSIT_ADDRESS} from '../deployments/mainnet/WBTCDepositToken.json'
import {address as FRAX_DEPOSIT_ADDRESS} from '../deployments/mainnet/FRAXDepositToken.json'
import {address as WETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/WETHDepositToken.json'
import {address as VAFRAX_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaFRAXDepositToken.json'
import {address as VAUSDC_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaUSDCDepositToken.json'
import {address as VAETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaETHDepositToken.json'
import {address as MSUSD_DEBT_ADDRESS} from '../deployments/mainnet/MsUSDDebt.json'
import {address as MSBTC_DEBT_ADDRESS} from '../deployments/mainnet/MsBTCDebt.json'
import {address as MSDOGE_DEBT_ADDRESS} from '../deployments/mainnet/MsDOGEDebt.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/mainnet/MsETHDebt.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsUSDSynthetic.json'
import {address as MSBTC_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsBTCSynthetic.json'
import {address as MSDOGE_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsDOGESynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsETHSynthetic.json'
import {address as NATIVE_TOKEN_GATEWAY_ADDRESS} from '../deployments/mainnet/NativeTokenGateway.json'
import {address as POOL_UPGRADER_ADDRESS} from '../deployments/mainnet/PoolUpgrader.json'
import {address as DEBT_TOKEN_UPGRADER_ADDRESS} from '../deployments/mainnet/DebtTokenUpgrader.json'
import {address as DEPOSIT_TOKEN_UPGRADER_ADDRESS} from '../deployments/mainnet/DepositTokenUpgrader.json'

const {MaxUint256, AddressZero} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

describe('E2E tests', function () {
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
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let pool: Pool
  let msdUSDC: DepositToken
  let msdWBTC: DepositToken
  let msdDAI: DepositToken
  let msdFRAX: DepositToken
  let msdWETH: DepositToken
  let msdVaFRAX: DepositToken
  let msdVaUSDC: DepositToken
  let msdVaETH: DepositToken
  let msUSDDebt: DebtToken
  let msBTCDebt: DebtToken
  let msDOGEDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msBTC: SyntheticToken
  let msDOGE: SyntheticToken
  let msETH: SyntheticToken

  if (isNodeHardhat) {
    before(enableForking)

    after(disableForking)
  }

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = ERC20__factory.connect(Address.USDC_ADDRESS, alice)
    dai = ERC20__factory.connect(Address.DAI_ADDRESS, alice)
    wbtc = ERC20__factory.connect(Address.WBTC_ADDRESS, alice)
    frax = ERC20__factory.connect(Address.FRAX_ADDRESS, alice)
    weth = IWETH__factory.connect(Address.WETH_ADDRESS, alice)
    vaFRAX = ERC20__factory.connect(Address.VAFRAX_ADDRESS, alice)
    vaUSDC = ERC20__factory.connect(Address.VAUSDC_ADDRESS, alice)
    vaETH = ERC20__factory.connect(Address.VAETH_ADDRESS, alice)

    poolRegistry = PoolRegistry__factory.connect(POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = NativeTokenGateway__factory.connect(NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = Pool__factory.connect(pool1Address, alice)

    msdUSDC = DepositToken__factory.connect(USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdDAI = DepositToken__factory.connect(DAI_DEPOSIT_ADDRESS, alice) // 8 decimals
    msdWBTC = DepositToken__factory.connect(WBTC_DEPOSIT_ADDRESS, alice)
    msdFRAX = DepositToken__factory.connect(FRAX_DEPOSIT_ADDRESS, alice)
    msdWETH = DepositToken__factory.connect(WETH_DEPOSIT_ADDRESS, alice)
    msdVaFRAX = DepositToken__factory.connect(VAFRAX_DEPOSIT_ADDRESS, alice)
    msdVaUSDC = DepositToken__factory.connect(VAUSDC_DEPOSIT_ADDRESS, alice)
    msdVaETH = DepositToken__factory.connect(VAETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = DebtToken__factory.connect(MSUSD_DEBT_ADDRESS, alice)
    msBTCDebt = DebtToken__factory.connect(MSBTC_DEBT_ADDRESS, alice)
    msDOGEDebt = DebtToken__factory.connect(MSDOGE_DEBT_ADDRESS, alice)
    msETHDebt = DebtToken__factory.connect(MSETH_DEBT_ADDRESS, alice)

    msUSD = SyntheticToken__factory.connect(MSUSD_SYNTHETIC_ADDRESS, alice)
    msBTC = SyntheticToken__factory.connect(MSBTC_SYNTHETIC_ADDRESS, alice)
    msDOGE = SyntheticToken__factory.connect(MSDOGE_SYNTHETIC_ADDRESS, alice)
    msETH = SyntheticToken__factory.connect(MSETH_SYNTHETIC_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(dai.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(wbtc.address, alice.address, parseUnits('10', 8))
    await setTokenBalance(frax.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaFRAX.address, alice.address, parseUnits('10', 18))
    await setTokenBalance(vaUSDC.address, alice.address, parseUnits('10', 18))
    await setTokenBalance(vaETH.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await dai.connect(alice).approve(msdDAI.address, MaxUint256)
    await wbtc.connect(alice).approve(msdWBTC.address, MaxUint256)
    await frax.connect(alice).approve(msdFRAX.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaFRAX.connect(alice).approve(msdVaFRAX.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC.address, MaxUint256)
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

    if (!isNodeHardhat && process.env.DEPLOYER) {
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
      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSBTC_DEBT_ADDRESS).eq(await pool.debtTokenOf(msBTC.address))
      expect(MSDOGE_DEBT_ADDRESS).eq(await pool.debtTokenOf(msDOGE.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))
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
      expect(await masterOracle.getPriceInUsd(msDOGE.address)).gt(0)
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
      const vesperGatewayFactory = new VesperGateway__factory(alice)
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

    it('should issue msDOGE', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 18)
      const tx = () => msDOGEDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msDOGE, alice, amount)
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
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0')) // 10%
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
      if (!isNodeHardhat) {
        // Note: Skipping for now since leverage feature isn't available on mainnet yet
        return
      }

      const abi = ethers.utils.defaultAbiCoder

      beforeEach(async function () {
        //
        // Setup RoutedSwapper with necessary routings
        //
        const oracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
        const routedSwapper = IRoutedSwapper__factory.connect(Address.ROUTED_SWAPPER, oracleGovernor)
        const swapType = 0 // EXACT_INPUT
        const exchangeType = 7 //Curve

        const path_msUSD_USDC = abi.encode(
          ['address[9]', 'uint256[3][4]'],
          [
            [
              msUSD.address,
              Address.CURVE_MSUSD_FRAXBP_POOL_ADDRESS,
              usdc.address,
              AddressZero,
              AddressZero,
              AddressZero,
              AddressZero,
              AddressZero,
              AddressZero,
            ],
            [
              [0, 2, 2],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ],
          ]
        )

        const path_msUSD_FRAX = abi.encode(
          ['address[9]', 'uint256[3][4]'],
          [
            [
              msUSD.address,
              Address.CURVE_MSUSD_FRAXBP_POOL_ADDRESS,
              frax.address,
              AddressZero,
              AddressZero,
              AddressZero,
              AddressZero,
              AddressZero,
              AddressZero,
            ],
            [
              [0, 1, 2],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ],
          ]
        )

        // Note: It won't be necessary when routings are added on mainnet
        await routedSwapper.setDefaultRouting(swapType, msUSD.address, usdc.address, exchangeType, path_msUSD_USDC)
        await routedSwapper.setDefaultRouting(swapType, msUSD.address, frax.address, exchangeType, path_msUSD_FRAX)

        //
        // Deploy `FeeProvider` implementation
        // Note: It won't be necessary when fee provider contract get online
        //
        const feeProviderFactory = new FeeProvider__factory(governor)
        const feeProvider = await feeProviderFactory.deploy()
        await feeProvider.deployed()
        await feeProvider.initialize(poolRegistry.address, Address.ESMET)

        //
        // Update `Pool` implementation
        // Note: It won't be necessary when leverage feature get online
        //
        const poolProxyOwner = await impersonateAccount(POOL_UPGRADER_ADDRESS)
        const poolProxy = TransparentUpgradeableProxy__factory.connect(pool.address, poolProxyOwner)
        const wipPoolImplFactory = new Pool__factory(poolProxyOwner)
        const wipPoolImpl = await wipPoolImplFactory.deploy()
        await poolProxy.upgradeTo(wipPoolImpl.address)

        //
        // Update `DebtToken` implementation
        // Note: It won't be necessary when leverage feature get online
        //
        const debtTokenProxyOwner = await impersonateAccount(DEBT_TOKEN_UPGRADER_ADDRESS)
        const debtTokenProxy = TransparentUpgradeableProxy__factory.connect(msUSDDebt.address, debtTokenProxyOwner)
        const wipDebtTokenImplFactory = new DebtToken__factory(debtTokenProxyOwner)
        const wipDebtTokenImpl = await wipDebtTokenImplFactory.deploy()
        await debtTokenProxy.upgradeTo(wipDebtTokenImpl.address)

        //
        // Update `DepositToken` implementation
        // Note: It won't be necessary when fee provider contract get online
        //
        const depositTokenProxyOwner = await impersonateAccount(DEPOSIT_TOKEN_UPGRADER_ADDRESS)
        const wipDepositTokenImplFactory = new DepositToken__factory(depositTokenProxyOwner)
        const wipDepositTokenImpl = await wipDepositTokenImplFactory.deploy()
        const msdVaUSDCProxy = TransparentUpgradeableProxy__factory.connect(msdVaUSDC.address, depositTokenProxyOwner)
        await msdVaUSDCProxy.upgradeTo(wipDepositTokenImpl.address)
        const msdVaFRAXProxy = TransparentUpgradeableProxy__factory.connect(msdVaFRAX.address, depositTokenProxyOwner)
        await msdVaFRAXProxy.upgradeTo(wipDepositTokenImpl.address)

        // given
        await pool.connect(governor).updateSwapper(routedSwapper.address)
        await pool.connect(governor).updateFeeProvider(feeProvider.address)
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
        await setTokenBalance(vaUSDC.address, alice.address, parseUnits('1000', 18))
        await setTokenBalance(vaFRAX.address, alice.address, parseUnits('1000', 18))
      })

      it('should leverage vaUSDC->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(pool.address, MaxUint256)
        const tx = await pool.leverage(msdVaUSDC.address, msUSD.address, amountIn, leverage, 0, 1)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountIn.mul(leverage).div(parseEther('1')), parseEther('10')) // ~$150
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
      })

      it('should leverage vaFRAX->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaFRAX.connect(alice).approve(pool.address, MaxUint256)
        const tx = await pool.leverage(msdVaFRAX.address, msUSD.address, amountIn, leverage, 0, 1)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountIn.mul(leverage).div(parseEther('1')), parseEther('10')) // ~$150
        expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
      })

      it('should leverage vaETH->msETH', async function () {
        // TODO
      })
    })
  })
})
