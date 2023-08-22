/* eslint-disable camelcase */
/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setBalance, setCode} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken,
  ERC20Mock,
  MasterOracleMock,
  SyntheticToken,
  Treasury,
  Pool,
  DebtToken,
  SwapperMock,
  VPoolMock,
  FeeProvider,
  SmartFarmingManager,
  PoolRegistry,
  ProxyOFT,
  CrossChainDispatcher,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../helpers'
import {CrossChainLib} from './helpers/CrossChainLib'
import {impersonateAccount} from './helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants
const {parseUnits} = ethers.utils

const CF = parseEther('0.5') // 60%
const metPrice = toUSD('4') // 1 MET = $4
const daiPrice = toUSD('1') // 1 DAI = $1
const msUsdPrice = toUSD('1')
const msEthPrice = toUSD('1')
const interestRate = parseEther('0')

const LZ_MAINNET_ID = '101'

describe('SmartFarmingManager', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let feeCollector: SignerWithAddress
  let swapper: SwapperMock
  let met: ERC20Mock
  let dai: ERC20Mock
  let vaDAI: VPoolMock
  let msUsdDebtToken: DebtToken
  let msUSD: SyntheticToken
  let msEthDebtToken: DebtToken
  let msETH: SyntheticToken
  let treasury: Treasury
  let msdMET: DepositToken
  let msdDAI: DepositToken
  let msdVaDAI: DepositToken
  let masterOracle: MasterOracleMock
  let smartFarmingManager: SmartFarmingManager
  let pool: Pool
  let crossChainDispatcher: FakeContract<CrossChainDispatcher>
  let crossChainDispatcherSigner: SignerWithAddress
  let poolRegistry: PoolRegistry
  let feeProvider: FeeProvider
  let proxyOFT: FakeContract<ProxyOFT>

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, feeCollector] = await ethers.getSigners()
    const masterOracleMockFactory = await ethers.getContractFactory('MasterOracleMock', deployer)
    masterOracle = await masterOracleMockFactory.deploy()
    await masterOracle.deployed()

    const swapperMockFactory = await ethers.getContractFactory('SwapperMock', deployer)
    swapper = await swapperMockFactory.deploy(masterOracle.address)
    await swapper.deployed()

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock', deployer)
    const vPoolMockFactory = await ethers.getContractFactory('VPoolMock', deployer)

    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
    await dai.deployed()

    vaDAI = await vPoolMockFactory.deploy('Vesper Pool Dai', 'vaDAI', dai.address)
    await vaDAI.deployed()

    const treasuryFactory = await ethers.getContractFactory('Treasury', deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const depositTokenFactory = await ethers.getContractFactory('DepositToken', deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()

    msdDAI = await depositTokenFactory.deploy()
    await msdDAI.deployed()

    msdVaDAI = await depositTokenFactory.deploy()
    await msdVaDAI.deployed()

    const debtTokenFactory = await ethers.getContractFactory('DebtToken', deployer)

    msUsdDebtToken = await debtTokenFactory.deploy()
    await msUsdDebtToken.deployed()

    msEthDebtToken = await debtTokenFactory.deploy()
    await msEthDebtToken.deployed()

    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)

    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    msETH = await syntheticTokenFactory.deploy()
    await msETH.deployed()

    const feeProviderFactory = await ethers.getContractFactory('FeeProvider', deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()

    const poolFactory = await ethers.getContractFactory('contracts/Pool.sol:Pool', deployer)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pool = await poolFactory.deploy()
    await pool.deployed()

    const smartFarmingManagerFactory = await ethers.getContractFactory('SmartFarmingManager', deployer)
    smartFarmingManager = await smartFarmingManagerFactory.deploy()
    await smartFarmingManager.deployed()

    const stargateFactory = await smock.fake('IStargateFactory')
    const stargatePool = await smock.fake('IStargatePool')
    const stargateRouter = await smock.fake('IStargateRouter')
    stargateRouter.factory.returns(stargateFactory.address)
    stargateFactory.getPool.returns(stargatePool.address)
    stargatePool.token.returns(dai.address)
    await setCode(stargateRouter.address, '0x01')
    await setCode(stargatePool.address, '0x01')

    crossChainDispatcher = await smock.fake('CrossChainDispatcher')
    await setCode(crossChainDispatcher.address, '0x01')
    crossChainDispatcher.isBridgingActive.returns(true)
    crossChainDispatcherSigner = await impersonateAccount(crossChainDispatcher.address)

    const poolRegistryFactory = await ethers.getContractFactory('PoolRegistry', deployer)
    poolRegistry = await poolRegistryFactory.deploy()
    await poolRegistry.initialize(masterOracle.address, feeCollector.address)
    await poolRegistry.registerPool(pool.address)
    await poolRegistry.updateSwapper(swapper.address)
    await poolRegistry.updateCrossChainDispatcher(crossChainDispatcher.address)

    const esMET = await smock.fake('IESMET')

    // Deployment tasks
    await msdMET.initialize(met.address, pool.address, 'Metronome Synth WETH-Deposit', 'msdMET', 18, CF, MaxUint256)
    await msdDAI.initialize(dai.address, pool.address, 'Metronome Synth DAI-Deposit', 'msdDAI', 18, CF, MaxUint256)
    await msdVaDAI.initialize(
      vaDAI.address,
      pool.address,
      'Metronome Synth vaDAI-Deposit',
      'msdVaDAI',
      18,
      CF,
      MaxUint256
    )
    await treasury.initialize(pool.address)

    await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistry.address)
    await msETH.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistry.address)
    await msUsdDebtToken.initialize('msUSD Debt', 'msUSD-Debt', pool.address, msUSD.address, interestRate, MaxUint256)
    await msEthDebtToken.initialize('msETH Debt', 'msETH-Debt', pool.address, msETH.address, interestRate, MaxUint256)
    await feeProvider.initialize(poolRegistry.address, esMET.address)
    await smartFarmingManager.initialize(pool.address)
    await pool.initialize(poolRegistry.address)
    await pool.updateMaxLiquidable(parseEther('1')) // 100%
    await pool.updateTreasury(treasury.address)
    await pool.updateSmartFarmingManager(smartFarmingManager.address)
    await pool.updateFeeProvider(feeProvider.address)
    await pool.addDepositToken(msdMET.address)
    await pool.addDepositToken(msdDAI.address)
    await pool.addDepositToken(msdVaDAI.address)
    await pool.addDebtToken(msUsdDebtToken.address)
    await pool.addDebtToken(msEthDebtToken.address)

    proxyOFT = await smock.fake('ProxyOFT')
    proxyOFT.token.returns(msUSD.address)
    msUSD.updateProxyOFT(proxyOFT.address)
    await setBalance(proxyOFT.address, parseEther('10'))

    // mint some collaterals to users
    await met.mint(alice.address, parseEther(`${1e6}`))
    await dai.mint(alice.address, parseEther(`${1e6}`))
    await vaDAI.mint(alice.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await masterOracle.updatePrice(dai.address, daiPrice)
    await masterOracle.updatePrice(met.address, metPrice)
    await masterOracle.updatePrice(vaDAI.address, daiPrice)
    await masterOracle.updatePrice(msUSD.address, msUsdPrice)
    await masterOracle.updatePrice(msETH.address, msEthPrice)

    await dai.mint(swapper.address, parseEther(`${1e6}`))
    await vaDAI.mint(swapper.address, parseEther(`${1e6}`))
    await met.mint(swapper.address, parseEther(`${1e6}`))

    await vaDAI.connect(alice).approve(smartFarmingManager.address, MaxUint256)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)
  })

  describe('flashRepay', function () {
    beforeEach('leverage vaDAI->msUSD', async function () {
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')

      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)
    })

    it('should revert if withdraw amount is too high', async function () {
      // when
      const withdrawAmount = (await msdVaDAI.balanceOf(alice.address)).add('1')
      const tx = smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsTooHigh')
    })

    it('should revert if repay amount is too high', async function () {
      // when
      const withdrawAmount = await msdVaDAI.balanceOf(alice.address)
      const repayAmountMin = (await msUsdDebtToken.balanceOf(alice.address)).add('1')
      const tx = smartFarmingManager
        .connect(alice)
        .flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, repayAmountMin)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsTooHigh')
    })

    it('should revert if slippage is too high', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const withdrawAmount = parseEther('50')
      const repayAmountMin = parseEther('49.5') // 1% slippage
      const tx = smartFarmingManager
        .connect(alice)
        .flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, repayAmountMin)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'FlashRepaySlippageTooHigh')
    })

    it('should revert if the outcome position is unhealthy', async function () {
      // given
      const {_debtInUsd: debtBefore, _depositInUsd: depositBefore} = await pool.debtPositionOf(alice.address)
      expect(depositBefore).eq(parseEther('150'))
      expect(debtBefore).eq(parseEther('50'))
      // Simulates huge slippage (90%), that makes user withdraw large collateral but repay small amount
      await swapper.updateRate(parseEther('0.1'))

      // when
      const withdrawAmount = parseEther('100')
      const tx = smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should flashRepay vaDAI->msUSD', async function () {
      // given
      const {_debtInUsd: debtBefore, _depositInUsd: depositBefore} = await pool.debtPositionOf(alice.address)
      expect(depositBefore).eq(parseEther('150'))
      expect(debtBefore).eq(parseEther('50'))

      // when
      const withdrawAmount = parseEther('50')
      await smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      const {_debtInUsd: debtAfter, _depositInUsd: depositAfter} = await pool.debtPositionOf(alice.address)
      expect(depositAfter).eq(parseEther('100'))
      expect(debtAfter).eq(0)
    })
  })

  describe('leverage', function () {
    beforeEach(async function () {
      // given
      expect(await feeProvider.issueFee()).eq(0)
      expect(await feeProvider.depositFee()).eq(0)
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_debtInUsd).eq(0)
      expect(_depositInUsd).eq(0)
    })

    it('should revert if X it too low', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1').sub('1')
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooLow')
    })

    it('should revert if X it too high', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      const leverage = maxLeverage.add('1')
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooHigh')
    })

    it('should revert if slippage is too high', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      const depositAmountMin = parseEther('147.5') // 5% slippage (100 + 50*0.95)
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, depositAmountMin)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageSlippageTooHigh')
    })

    it('should revert if outcome position is not healthy', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, maxLeverage, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should revert if outcome position is too close to min leverage making swap return 0', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const minLeverage = parseEther('1').add('1')
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, minLeverage, 0)

      // then
      await expect(tx).revertedWith('amount-out-zero') // Error from DEX
    })

    it('should be able to leverage close to min', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.01')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(amountIn, parseEther('5')) // ~$100
      expect(_debtInUsd).closeTo(0, parseEther('5')) // ~$0
    })

    it('should be able to leverage (a little bit less than the) max', async function () {
      // given
      await swapper.updateRate(parseEther('0.999')) // 0.1% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      expect(maxLeverage).eq(parseEther('2'))
      const damper = parseEther('0.05')
      const leverage = maxLeverage.sub(damper) // -5% to cover fees + slippage
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(parseEther('200'), parseEther('10')) // ~$200
      expect(_debtInUsd).closeTo(parseEther('100'), parseEther('10')) // ~$100
    })

    it('should leverage vaDAI->msUSD', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(amountIn.mul(leverage).div(parseEther('1')), parseEther('10')) // ~$150
      // eslint-disable-next-line max-len
      expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
    })

    it('should leverage vaDAI->msUSD using MET as tokenIn', async function () {
      // given
      await masterOracle.updatePrice(met.address, parseEther('0.5'))

      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await met.connect(alice).approve(smartFarmingManager.address, MaxUint256)
      await smartFarmingManager
        .connect(alice)
        .leverage(met.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      expect(await met.balanceOf(smartFarmingManager.address)).eq(0)
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(parseEther('75'), parseEther('10'))
      expect(_debtInUsd).closeTo(parseEther('25'), parseEther('10'))
    })
  })

  describe('crossChainFlashRepay', function () {
    beforeEach('leverage vaDAI->msUSD', async function () {
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)
    })

    it('should revert if deposit token is invalid', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager.connect(alice).crossChainFlashRepay(
        syntheticToken,
        alice.address, // invalid msdToken
        withdrawAmount,
        dai.address,
        underlyingAmountMin,
        layer1SwapAmountOutMin,
        repayAmountMin,
        lzArgs,
        {value: fee}
      )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'DepositTokenDoesNotExist')
    })

    it('should revert if synthetic token is invalid', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = alice.address // invalid msToken
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SyntheticDoesNotExist')
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if amount to withdraw is zero', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = '0'
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsZero')
    })

    it('should revert if amount to withdraw is higher than the unlock balance', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('100')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'NotEnoughFreeBalance')
    })

    it('should revert if amount to repay is too high', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('51')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsTooHigh')
    })

    it('should revert if swap slippage is too high', async function () {
      // given
      expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('100000')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).reverted
    })

    it('should revert if position is unhealthy', async function () {
      // given
      await masterOracle.updatePrice(msUSD.address, parseEther('10'))

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'NotEnoughFreeBalance')
    })

    it('should revert if position end up unhealthy', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = (await msdVaDAI.unlockedBalanceOf(alice.address)).add('1')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'NotEnoughFreeBalance')
    })

    it('should start L2 flash repay flow', async function () {
      // given
      expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const swapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.25'), '250000')
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          swapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx)
        .changeTokenBalance(vaDAI, treasury.address, withdrawAmount.mul('-1'))
        .changeTokenBalance(dai, crossChainDispatcher.address, withdrawAmount)

      const length = 1
      const requestId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [1, length]))
      expect(await smartFarmingManager.crossChainRequestsLength()).eq(length)
      const request = await smartFarmingManager.crossChainFlashRepays(requestId)
      expect(request.syntheticToken).eq(syntheticToken)
      expect(request.repayAmountMin).eq(repayAmountMin)
      expect(request.account).eq(alice.address)
      expect(request.finished).eq(false)
      expect(crossChainDispatcher.triggerFlashRepaySwap)
        .calledWith(requestId, alice.address, dai.address, syntheticToken, parseEther('10'), swapAmountOutMin, lzArgs)
        .calledWithValue(fee)
    })
  })

  describe('crossChainFlashRepayCallback', function () {
    const length = 1
    const id = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [1, length]))

    beforeEach(async function () {
      // Create position
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // Start flash repay
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.25'), '250000')
      await smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.crossChainRequestsLength()).eq(length)

      await dai.mint(crossChainDispatcher.address, parseEther('10000'))
      await dai.connect(crossChainDispatcherSigner).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
      await dai.connect(crossChainDispatcherSigner).approve(msdDAI.address, ethers.constants.MaxUint256)

      await msdDAI.connect(crossChainDispatcherSigner).deposit(parseEther('2000'), crossChainDispatcher.address)
      await msUsdDebtToken.connect(crossChainDispatcherSigner).issue(parseEther('1000'), crossChainDispatcher.address)
      await msUSD.connect(crossChainDispatcherSigner).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const tx = smartFarmingManager
        .connect(crossChainDispatcherSigner)
        .crossChainFlashRepayCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if caller is invalid', async function () {
      // given
      const fakeCCD = await smock.fake<CrossChainDispatcher>('CrossChainDispatcher')
      fakeCCD.poolRegistry.returns(poolRegistry.address)
      await setBalance(fakeCCD.address, parseEther('10'))

      // when
      const tx = smartFarmingManager.connect(fakeCCD.wallet).crossChainFlashRepayCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotCrossChainDispatcher')
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager
        .connect(crossChainDispatcherSigner)
        .crossChainFlashRepayCallback(invalidId, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestInvalidKey')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(crossChainDispatcherSigner).crossChainFlashRepayCallback(id, swapAmountOut)

      // when
      const tx = smartFarmingManager.connect(crossChainDispatcherSigner).crossChainFlashRepayCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestCompletedAlready')
    })

    it('should revert if swapAmountOut slippage is too high', async function () {
      // given
      const {repayAmountMin} = await smartFarmingManager.crossChainFlashRepays(id)

      // when
      const tx = smartFarmingManager
        .connect(crossChainDispatcherSigner)
        .crossChainFlashRepayCallback(id, repayAmountMin.sub('1'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'FlashRepaySlippageTooHigh')
    })

    it('should finish L2 flash repay flow', async function () {
      // given
      const swapAmountOut = parseEther('10')

      // when
      const tx = smartFarmingManager.connect(crossChainDispatcherSigner).crossChainFlashRepayCallback(id, swapAmountOut)

      // then
      await expect(tx)
        .changeTokenBalance(msUSD, crossChainDispatcher.address, swapAmountOut.mul('-1'))
        .changeTokenBalance(msUsdDebtToken, alice.address, swapAmountOut.mul('-1'))
      const {finished} = await smartFarmingManager.crossChainFlashRepays(id)
      expect(finished).true
    })
  })

  describe('crossChainLeverage', function () {
    beforeEach(async function () {
      await dai.connect(alice).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if leverage is too low', async function () {
      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('0.99')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooLow')
    })

    it('should revert if leverage is too high', async function () {
      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('20')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooHigh')
    })

    it('should revert if underlying is null', async function () {
      // when
      const fee = parseEther('0.1')
      const underlying = ethers.constants.AddressZero
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'TokenInIsNull')
    })

    it('should start L2 leverage flow', async function () {
      // given
      expect(await smartFarmingManager.crossChainRequestsLength()).eq(0)

      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const swapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.25'), '250000')
      const expectedToIssue = parseEther('5')
      const tx = smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          swapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx)
        .changeTokenBalance(dai, smartFarmingManager.address, amountIn)
        .changeTokenBalance(msUSD, crossChainDispatcher.address, expectedToIssue)

      const length = 1
      const requestId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [1, length]))
      expect(await smartFarmingManager.crossChainRequestsLength()).eq(length)
      const request = await smartFarmingManager.crossChainLeverages(requestId)
      expect(request.underlying).eq(underlying)
      expect(request.depositToken).eq(depositToken)
      expect(request.syntheticToken).eq(syntheticToken)
      expect(request.depositAmountMin).eq(depositAmountMin)
      expect(request.syntheticTokenIssued).eq(expectedToIssue)
      expect(request.account).eq(alice.address)
      expect(request.finished).eq(false)
      expect(crossChainDispatcher.triggerLeverageSwap)
        .calledWith(requestId, alice.address, syntheticToken, dai.address, expectedToIssue, swapAmountOutMin, lzArgs)
        .calledWithValue(fee)
    })
  })

  describe('crossChainLeverageCallback', function () {
    const length = 1
    const id = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [1, length]))

    beforeEach(async function () {
      await dai.connect(alice).approve(smartFarmingManager.address, ethers.constants.MaxUint256)

      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const swapAmountOutMin = parseEther('4.5')
      const depositAmountMin = parseEther('14')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.25'), '250000')
      await smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          swapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.crossChainRequestsLength()).eq(length)

      await dai.mint(crossChainDispatcher.address, parseEther('10000'))
      await dai.connect(crossChainDispatcherSigner).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if caller is invalid', async function () {
      // given
      const fakeCCD = await smock.fake<CrossChainDispatcher>('CrossChainDispatcher')
      fakeCCD.poolRegistry.returns(poolRegistry.address)
      await setBalance(fakeCCD.address, parseEther('10'))

      // when
      const tx = smartFarmingManager.connect(fakeCCD.wallet).crossChainLeverageCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotCrossChainDispatcher')
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const tx = smartFarmingManager
        .connect(crossChainDispatcherSigner)
        .crossChainLeverageCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager
        .connect(crossChainDispatcherSigner)
        .crossChainLeverageCallback(invalidId, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestInvalidKey')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(crossChainDispatcherSigner).crossChainLeverageCallback(id, swapAmountOut)

      // when
      const tx = smartFarmingManager.connect(crossChainDispatcherSigner).crossChainLeverageCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestCompletedAlready')
    })

    it('should revert if swapAmountOut slippage is too high', async function () {
      // given
      const {depositAmountMin, underlyingAmountIn} = await smartFarmingManager.crossChainLeverages(id)

      // when
      const swapAmountOut = depositAmountMin.sub(underlyingAmountIn).sub('1')
      const tx = smartFarmingManager.connect(crossChainDispatcherSigner).crossChainLeverageCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageSlippageTooHigh')
    })

    it('should revert if position end up unhealthy', async function () {
      // given
      await masterOracle.updatePrice(msUSD.address, parseEther('2'))

      // when
      const swapAmountOut = parseEther('4.1')
      const tx = smartFarmingManager.connect(crossChainDispatcherSigner).crossChainLeverageCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should finish L2 leverage flow', async function () {
      // given
      const {syntheticTokenIssued} = await smartFarmingManager.crossChainLeverages(id)

      // when
      const swapAmountOut = parseEther('4.1')
      const tx = smartFarmingManager.connect(crossChainDispatcherSigner).crossChainLeverageCallback(id, swapAmountOut)

      // then
      await expect(tx)
        .changeTokenBalance(dai, crossChainDispatcher.address, swapAmountOut.mul('-1'))
        .changeTokenBalance(msUsdDebtToken, alice.address, syntheticTokenIssued)
      const {finished} = await smartFarmingManager.crossChainLeverages(id)
      expect(finished).true
    })
  })

  describe('retryCrossChainFlashRepayCallback', function () {
    const length = 1
    const id = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [1, length]))
    const newRepayAmountMin = 1
    const srcChainId = 101
    const srcAddress = '0x0000000000000000000000000000000000000001'
    const nonce = 123
    const amount = parseEther('1')
    const payload = '0x'

    beforeEach(async function () {
      // Create position
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // Start flash repay
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.25'), '250000')
      await smartFarmingManager
        .connect(alice)
        .crossChainFlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.crossChainRequestsLength()).eq(length)

      await dai.mint(crossChainDispatcher.address, parseEther('10000'))
      await dai.connect(crossChainDispatcherSigner).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
      await dai.connect(crossChainDispatcherSigner).approve(msdDAI.address, ethers.constants.MaxUint256)

      await msdDAI.connect(crossChainDispatcherSigner).deposit(parseEther('2000'), crossChainDispatcher.address)
      await msUsdDebtToken.connect(crossChainDispatcherSigner).issue(parseEther('1000'), crossChainDispatcher.address)
      await msUSD.connect(crossChainDispatcherSigner).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager.retryCrossChainFlashRepayCallback(
        invalidId,
        newRepayAmountMin,
        srcChainId,
        srcAddress,
        nonce,
        amount,
        payload
      )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestInvalidKey')
    })

    it('should revert if caller is not the correct account', async function () {
      // when
      const tx = smartFarmingManager
        .connect(bob)
        .retryCrossChainFlashRepayCallback(id, newRepayAmountMin, srcChainId, srcAddress, nonce, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotAccount')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(crossChainDispatcherSigner).crossChainFlashRepayCallback(id, swapAmountOut)
      const {finished} = await smartFarmingManager.crossChainFlashRepays(id)
      expect(finished).true

      // when
      const tx = smartFarmingManager
        .connect(alice)
        .retryCrossChainFlashRepayCallback(id, newRepayAmountMin, srcChainId, srcAddress, nonce, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestCompletedAlready')
    })

    it('should update repayAmountMin and retry', async function () {
      // given
      const {repayAmountMin: before} = await smartFarmingManager.crossChainFlashRepays(id)
      crossChainDispatcher.crossChainDispatcherOf.returns(crossChainDispatcher.address)

      // when
      await smartFarmingManager
        .connect(alice)
        .retryCrossChainFlashRepayCallback(id, newRepayAmountMin, srcChainId, srcAddress, nonce, amount, payload)

      // then
      const {repayAmountMin: after} = await smartFarmingManager.crossChainFlashRepays(id)
      expect(after).not.eq(before)
      expect(proxyOFT.retryOFTReceived).calledWith(
        srcChainId,
        srcAddress,
        nonce,
        ethers.utils.solidityPack(['address'], [crossChainDispatcher.address]),
        crossChainDispatcher.address,
        amount,
        payload
      )
    })
  })

  describe('retryCrossChainLeverageCallback', function () {
    const length = 1
    const id = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [1, length]))
    const newDepositAmountMin = 1
    const srcChainId = 101
    const srcAddress = '0x0000000000000000000000000000000000000001'
    const nonce = 123

    beforeEach(async function () {
      await dai.connect(alice).approve(smartFarmingManager.address, ethers.constants.MaxUint256)

      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('4.5')
      const depositAmountMin = parseEther('14')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, parseEther('0.25'), '250000')
      await smartFarmingManager
        .connect(alice)
        .crossChainLeverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.crossChainRequestsLength()).eq(length)

      await dai.mint(crossChainDispatcher.address, parseEther('10000'))
      await dai.connect(crossChainDispatcherSigner).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager.retryCrossChainLeverageCallback(
        invalidId,
        newDepositAmountMin,
        srcChainId,
        srcAddress,
        nonce
      )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestInvalidKey')
    })

    it('should revert if caller is not the correct account', async function () {
      // when
      const tx = smartFarmingManager
        .connect(bob)
        .retryCrossChainLeverageCallback(id, newDepositAmountMin, srcChainId, srcAddress, nonce)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotAccount')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(crossChainDispatcherSigner).crossChainLeverageCallback(id, swapAmountOut)
      const {finished} = await smartFarmingManager.crossChainLeverages(id)
      expect(finished).true

      // when
      const tx = smartFarmingManager
        .connect(alice)
        .retryCrossChainLeverageCallback(id, newDepositAmountMin, srcChainId, srcAddress, nonce)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'CrossChainRequestCompletedAlready')
    })

    it('should update depositAmountMin and retry', async function () {
      // given
      const stargateRouter = await smock.fake('IStargateRouter')
      crossChainDispatcher.stargateRouter.returns(stargateRouter.address)
      const {depositAmountMin: before} = await smartFarmingManager.crossChainLeverages(id)

      // when
      await smartFarmingManager
        .connect(alice)
        .retryCrossChainLeverageCallback(id, newDepositAmountMin, srcChainId, srcAddress, nonce)

      // then
      const {depositAmountMin: after} = await smartFarmingManager.crossChainLeverages(id)
      expect(after).not.eq(before)
      expect(stargateRouter.clearCachedSwap).calledWith(srcChainId, srcAddress, nonce)
    })
  })
})
